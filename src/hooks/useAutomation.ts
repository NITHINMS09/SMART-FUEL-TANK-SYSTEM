import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AutomationEvent,
  AutomationFeedbackState,
  AutomationStatus,
  AutomaticCapState,
  CalibrationPoint,
  ConnectionState,
  InterpolationResult,
  LoadCellStats,
  MotorDirection,
  MotorProfile,
  OperatingMode,
  RawReading,
} from '../types';
import { AutomationService, AutoCloseProgress } from '../services/automationService';
import { calculateTargetMotorAngle } from '../services/motorService';
import { StorageService } from '../services/storageService';
import { serialService, SerialEvent } from '../services/serialService';

export function useAutomation(
  readings: RawReading[],
  stats: LoadCellStats,
  volumeInterpolation: InterpolationResult,
  calibrationPoints: CalibrationPoint[],
  motorProfiles: MotorProfile[],
  connectionState: ConnectionState,
  onRotate?: (action: 'OPEN' | 'CLOSE', degrees: number, direction: MotorDirection) => Promise<void>
) {
  // Mode selection (persisted)
  const [mode, setMode] = useState<OperatingMode>(() => {
    try {
      const saved = localStorage.getItem('smart_tank_operating_mode');
      return (saved === 'AUTOMATIC' || saved === 'MANUAL') ? saved : 'MANUAL';
    } catch {
      return 'MANUAL';
    }
  });

  // Position tracking (in degrees, starts at 0° or loaded from storage)
  const [currentMotorPosition, setCurrentMotorPosition] = useState<number>(() => {
    return StorageService.loadMotorPosition();
  });

  const [targetMotorPosition, setTargetMotorPosition] = useState<number>(0);
  const [requiredAdjustment, setRequiredAdjustment] = useState<number>(0);
  const [motorDirection, setMotorDirection] = useState<MotorDirection | 'IDLE'>('IDLE');
  const [status, setStatus] = useState<AutomationStatus>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [lastAdjustmentTime, setLastAdjustmentTime] = useState<number | null>(null);
  const [lastAdjustmentDetails, setLastAdjustmentDetails] = useState<string | null>(null);

  // Configurable loop tuning parameters
  const [config, setConfig] = useState(() => StorageService.loadAutomationConfig());

  // Hardware motor movement lock
  const [isMotorMoving, setIsMotorMoving] = useState<boolean>(serialService.isMotorRunning());

  // Operation history
  const [history, setHistory] = useState<AutomationEvent[]>(() => {
    return StorageService.loadAutomationHistory();
  });

  // Legacy progress interface for backward compatibility
  const [progress, setProgress] = useState<AutoCloseProgress>({
    stage: 'IDLE',
    measuredVolumeMl: null,
    targetDegrees: null,
    targetDirection: null,
    errorMessage: null,
  });

  // Dedicated Automatic Cap Control State (Display metrics)
  const [capControlState, setCapControlState] = useState<AutomaticCapState>({
    lastAction: null,
    stage: 'IDLE',
    currentRaw: null,
    calculatedVolumeMl: null,
    selectedProfile: null,
    selectedDegrees: null,
    selectedDirection: null,
    isInterpolated: false,
    motorStatus: 'IDLE',
    lastOperationTime: null,
    errorMessage: null,
  });

  // Synchronous refs for feedback control cycle to avoid closure staleness
  const lastAdjustmentTimeRef = useRef<number>(0);
  const isExecutingAdjustmentRef = useRef<boolean>(false);
  const currentPosRef = useRef<number>(currentMotorPosition);
  currentPosRef.current = currentMotorPosition;

  // Persist mode changes
  useEffect(() => {
    try {
      localStorage.setItem('smart_tank_operating_mode', mode);
    } catch (e) {
      console.warn('Failed to save operating mode:', e);
    }
  }, [mode]);

  // Persist motor position
  useEffect(() => {
    StorageService.saveMotorPosition(currentMotorPosition);
  }, [currentMotorPosition]);

  // Persist configuration
  useEffect(() => {
    StorageService.saveAutomationConfig(config);
  }, [config]);

  // Persist history
  useEffect(() => {
    StorageService.saveAutomationHistory(history);
  }, [history]);

  const addEventToHistory = useCallback((event: AutomationEvent) => {
    setHistory((prev) => [event, ...prev].slice(0, 100));
  }, []);

  // Listen to motor state and position from hardware serial stream
  useEffect(() => {
    const unsubscribe = serialService.subscribe((event: SerialEvent) => {
      if (event.type === 'MOTOR_STARTED') {
        setIsMotorMoving(true);
      } else if (event.type === 'MOTOR_COMPLETED') {
        setIsMotorMoving(false);
        isExecutingAdjustmentRef.current = false;
      } else if (event.type === 'MOTOR_POS') {
        const rounded = Math.round(event.degrees * 10) / 10;
        setCurrentMotorPosition(rounded);
        currentPosRef.current = rounded;
      } else if (event.type === 'STATE_CHANGED' && event.state !== 'CONNECTED') {
        setIsMotorMoving(false);
        isExecutingAdjustmentRef.current = false;
        if (mode === 'AUTOMATIC') {
          setStatus('IDLE');
        }
      }
    });

    return unsubscribe;
  }, [mode]);

  /**
   * Continuous Feedback Control Loop:
   * LOAD CELL -> RAW READING -> FILTERING -> ML CALCULATION -> MOTOR PROFILE LOOKUP -> TARGET POSITION -> MOTOR ADJUSTMENT -> REPEAT
   */
  useEffect(() => {
    // 1. Guard: Automation loop only runs when mode is AUTOMATIC and connected
    if (mode !== 'AUTOMATIC') {
      setStatus('IDLE');
      setMotorDirection('IDLE');
      setErrorMessage(null);
      return;
    }

    if (connectionState !== 'CONNECTED') {
      setStatus('IDLE');
      setMotorDirection('IDLE');
      setErrorMessage('ESP32 not connected. Connect serial cable to enable automation.');
      return;
    }

    // 2. Prerequisites: confirmed calibration points and configured motor profiles
    const confirmedPoints = calibrationPoints.filter((p) => p.status === 'CONFIRMED');
    if (confirmedPoints.length < 2) {
      setStatus('ERROR');
      setMotorDirection('IDLE');
      setErrorMessage('Automatic mode requires at least 2 confirmed calibration points for volume interpolation.');
      return;
    }

    if (!motorProfiles || motorProfiles.length === 0) {
      setStatus('ERROR');
      setMotorDirection('IDLE');
      setErrorMessage('Automatic mode requires at least 1 configured motor profile.');
      return;
    }

    setErrorMessage(null);

    // 3. Liquid volume availability
    const volumeMl = volumeInterpolation.volumeMl;
    if (volumeMl === null) {
      setStatus('MONITORING');
      setMotorDirection('IDLE');
      return;
    }

    // 4. Motor Profile Lookup & Interpolation
    const targetResult = calculateTargetMotorAngle(
      volumeMl,
      motorProfiles,
      config.minMotorAngle,
      config.maxMotorAngle
    );

    if (!targetResult) {
      setStatus('ERROR');
      setErrorMessage('Failed to compute target angle from motor profiles.');
      return;
    }

    const targetAngle = Math.round(targetResult.targetAngle * 10) / 10;
    setTargetMotorPosition(targetAngle);

    // 5. Compare new target with commanded motor position
    const currentPos = currentPosRef.current;
    const diff = Math.round((targetAngle - currentPos) * 10) / 10;
    setRequiredAdjustment(diff);

    // 6. Anti-Oscillation & Deadband Check
    if (Math.abs(diff) < config.angleDeadband) {
      setMotorDirection('IDLE');
      setStatus('STABLE');
      return;
    }

    const proposedDirection: MotorDirection = diff > 0 ? 'CW' : 'CCW';
    setMotorDirection(proposedDirection);

    // 7. Reading Stability Check
    // "Do not move the motor using unstable readings."
    if (stats.stability === 'UNSTABLE') {
      setStatus('UNSTABLE');
      return;
    }

    // 8. Busy Guard
    // "Do not repeatedly send motor commands while a previous movement is still being processed."
    if (isMotorMoving || isExecutingAdjustmentRef.current || serialService.isMotorRunning()) {
      setStatus('ADJUSTING');
      return;
    }

    // 9. Rate Limiting / Settling Period
    // "Limit how frequently target adjustments can be issued."
    const now = Date.now();
    if (now - lastAdjustmentTimeRef.current < config.minAdjustmentInterval) {
      setStatus('MONITORING');
      return;
    }

    // 10. Execute Motor Adjustment for the required difference only
    const degToMove = Math.round(Math.abs(diff));
    if (degToMove < 1) {
      setStatus('STABLE');
      setMotorDirection('IDLE');
      return;
    }

    // Set lock
    isExecutingAdjustmentRef.current = true;
    lastAdjustmentTimeRef.current = now;
    setLastAdjustmentTime(now);
    setStatus('ADJUSTING');

    const details = `Auto adjust: ${degToMove}° ${proposedDirection} to reach target ${targetAngle}° (${Math.round(volumeMl)} ml)`;
    setLastAdjustmentDetails(details);

    (async () => {
      try {
        const event = await AutomationService.executeAdjustment(
          degToMove,
          proposedDirection,
          volumeMl,
          targetAngle
        );
        addEventToHistory(event);

        // Update local position tracking
        const newPos = proposedDirection === 'CW' ? currentPos + degToMove : currentPos - degToMove;
        const clampedPos = Math.round(newPos * 10) / 10;
        setCurrentMotorPosition(clampedPos);
        currentPosRef.current = clampedPos;
        StorageService.saveMotorPosition(clampedPos);

        setStatus('STABLE');
        setMotorDirection('IDLE');
      } catch (err: any) {
        setStatus('ERROR');
        setErrorMessage(`Adjustment failed: ${err.message}`);
      } finally {
        isExecutingAdjustmentRef.current = false;
      }
    })();
  }, [
    mode,
    connectionState,
    volumeInterpolation.volumeMl,
    stats.stability,
    calibrationPoints,
    motorProfiles,
    isMotorMoving,
    config,
    addEventToHistory,
  ]);

  /**
   * Emergency Motor Stop: Immediately cuts motor driver and switches to manual mode
   */
  const triggerEmergencyStop = useCallback(async () => {
    isExecutingAdjustmentRef.current = false;
    setMode('MANUAL');
    setStatus('ERROR');
    setMotorDirection('IDLE');

    try {
      const event = await AutomationService.executeEmergencyStop();
      addEventToHistory(event);
      setErrorMessage('Emergency stop activated. Stepper motor coils disabled.');
    } catch (e: any) {
      console.error('Emergency stop error:', e);
    }
  }, [addEventToHistory]);

  /**
   * Zero / Calibrate motor reference angle (e.g. at tank empty baseline)
   */
  const zeroMotorPosition = useCallback(async () => {
    setCurrentMotorPosition(0);
    currentPosRef.current = 0;
    StorageService.saveMotorPosition(0);

    try {
      if (connectionState === 'CONNECTED') {
        await serialService.sendCommand('SET_POS,0');
      }
      addEventToHistory({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'AUTO_ADJUST',
        mode,
        volumeMl: null,
        degrees: 0,
        direction: 'NONE',
        status: 'SUCCESS',
        details: 'Motor position reference zeroed (0° reference calibrated).',
      });
    } catch (e) {
      console.warn('Failed to send SET_POS to ESP32:', e);
    }
  }, [connectionState, mode, addEventToHistory]);

  /**
   * Automatic Cap Open Workflow:
   * 1. Capture fresh stable reading.
   * 2. Calculate volume ml using saved calibration points.
   * 3. Identify matching OPEN profile (interpolating if between configured volume points).
   * 4. Retrieve configured open rotation & direction.
   * 5. Execute existing manual motor function with those exact settings.
   * 6. Display selected profile and movement status.
   */
  const triggerCapOpen = useCallback(async () => {
    if (isMotorMoving || isExecutingAdjustmentRef.current) return;
    isExecutingAdjustmentRef.current = true;

    try {
      const event = await AutomationService.executeAutomaticCap(
        'OPEN',
        readings,
        calibrationPoints,
        motorProfiles,
        (partial) => {
          setCapControlState((prev) => ({ ...prev, ...partial }));
        },
        onRotate
      );
      addEventToHistory(event);
    } catch (err: any) {
      console.error('Automatic Cap Open execution error:', err);
    } finally {
      isExecutingAdjustmentRef.current = false;
    }
  }, [isMotorMoving, readings, calibrationPoints, motorProfiles, onRotate, addEventToHistory]);

  /**
   * Automatic Cap Close Workflow:
   * 1. Capture fresh stable reading.
   * 2. Calculate volume ml using saved calibration points.
   * 3. Identify matching CLOSE profile (interpolating if between configured volume points).
   * 4. Retrieve configured close rotation & direction.
   * 5. Execute existing manual motor function with those exact settings.
   * 6. Display selected profile and movement status.
   */
  const triggerCapClose = useCallback(async () => {
    if (isMotorMoving || isExecutingAdjustmentRef.current) return;
    isExecutingAdjustmentRef.current = true;

    try {
      const event = await AutomationService.executeAutomaticCap(
        'CLOSE',
        readings,
        calibrationPoints,
        motorProfiles,
        (partial) => {
          setCapControlState((prev) => ({ ...prev, ...partial }));
        },
        onRotate
      );
      addEventToHistory(event);
    } catch (err: any) {
      console.error('Automatic Cap Close execution error:', err);
    } finally {
      isExecutingAdjustmentRef.current = false;
    }
  }, [isMotorMoving, readings, calibrationPoints, motorProfiles, onRotate, addEventToHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const updateConfig = useCallback((updates: Partial<typeof config>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Aggregated state object for UI
  const feedbackState: AutomationFeedbackState = {
    mode,
    status,
    liveRaw: stats.currentRaw,
    filteredRaw: stats.filteredRaw !== null ? stats.filteredRaw : stats.average,
    calculatedVolumeMl: volumeInterpolation.volumeMl,
    currentMotorPosition,
    targetMotorPosition,
    requiredAdjustment,
    motorDirection,
    lastAdjustmentTime,
    lastAdjustmentDetails,
    angleDeadband: config.angleDeadband,
    volumeDeadband: config.volumeDeadband,
    minAdjustmentInterval: config.minAdjustmentInterval,
    maxMotorAngle: config.maxMotorAngle,
    minMotorAngle: config.minMotorAngle,
    isMotorMoving,
    stability: stats.stability,
    errorMessage,
    capControl: {
      ...capControlState,
      currentRaw: capControlState.currentRaw !== null ? capControlState.currentRaw : stats.currentRaw,
      calculatedVolumeMl:
        capControlState.calculatedVolumeMl !== null
          ? capControlState.calculatedVolumeMl
          : volumeInterpolation.volumeMl,
      motorStatus: isMotorMoving ? 'MOVING' : capControlState.motorStatus,
    },
  };

  return {
    mode,
    setMode,
    status,
    currentMotorPosition,
    targetMotorPosition,
    requiredAdjustment,
    motorDirection,
    lastAdjustmentTime,
    lastAdjustmentDetails,
    isMotorMoving,
    isRunning: mode === 'AUTOMATIC' || isMotorMoving,
    config,
    updateConfig,
    history,
    progress,
    errorMessage,
    feedbackState,
    capControlState,
    triggerEmergencyStop,
    zeroMotorPosition,
    triggerCapClose,
    triggerCapOpen,
    clearHistory,
    addEventToHistory,
  };
}
