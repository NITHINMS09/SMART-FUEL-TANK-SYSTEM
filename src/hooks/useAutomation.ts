import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AutomationEvent,
  AutomationFeedbackState,
  AutomationStatus,
  AutomaticCapState,
  AutomaticSystemState,
  CalibrationPoint,
  CapState,
  ConnectionState,
  InterpolationResult,
  LoadCellStats,
  MotorDirection,
  MotorProfile,
  OperatingMode,
  RawReading,
} from '../types';
import { AutomationService, AutoCloseProgress } from '../services/automationService';
import { interpolateMotorAction } from '../services/motorService';
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
  // 1. Cap State (OPEN or CLOSED) - Controls automatic mode
  const [capState, setCapState] = useState<CapState>(() => StorageService.loadCapState());

  // 2. High-level System State (Exact Requirements: 7 States)
  const [systemState, setSystemState] = useState<AutomaticSystemState>(() => {
    return capState === 'CLOSED'
      ? 'CAP CLOSED — AUTOMATION ACTIVE'
      : 'CAP OPEN — AUTOMATION DISABLED';
  });

  // Mode selection (derived from capState: CLOSED = AUTOMATIC, OPEN = MANUAL)
  const [mode, setMode] = useState<OperatingMode>(() => (capState === 'CLOSED' ? 'AUTOMATIC' : 'MANUAL'));

  // Commanded motor position tracking
  const [currentMotorPosition, setCurrentMotorPosition] = useState<number>(() => {
    return StorageService.loadMotorPosition();
  });

  const [targetMotorPosition, setTargetMotorPosition] = useState<number>(0);
  const [requiredAdjustment, setRequiredAdjustment] = useState<number>(0);
  const [motorDirection, setMotorDirection] = useState<MotorDirection | 'IDLE'>('IDLE');
  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null);
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

  // Progress interface for backward compatibility
  const [progress, setProgress] = useState<AutoCloseProgress>({
    stage: 'IDLE',
    measuredVolumeMl: null,
    targetDegrees: null,
    targetDirection: null,
    errorMessage: null,
  });

  // Dedicated Cap Control State
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

  // Synchronous refs to avoid stale closures in event and feedback loops
  const lastCommandedTargetAngleRef = useRef<number | null>(null);
  const lastAdjustmentTimeRef = useRef<number>(0);
  const isExecutingAdjustmentRef = useRef<boolean>(false);
  const currentPosRef = useRef<number>(currentMotorPosition);
  currentPosRef.current = currentMotorPosition;

  // Sync mode with capState
  useEffect(() => {
    const newMode: OperatingMode = capState === 'CLOSED' ? 'AUTOMATIC' : 'MANUAL';
    setMode(newMode);
    try {
      localStorage.setItem('smart_tank_operating_mode', newMode);
      StorageService.saveCapState(capState);
    } catch (e) {
      console.warn('Failed to persist cap state:', e);
    }
  }, [capState]);

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
        setSystemState('SENSOR ERROR');
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Continuous Feedback Control Loop:
   * 
   * HX711 RAW READING
   *         ↓
   * FILTER RAW READING
   *         ↓
   * CALCULATE CURRENT ML
   *         ↓
   * CHECK CAP STATE
   *         ↓
   * IS CAP CLOSED?
   *    NO  → SKIP ALL MOTOR COMMANDS (CAP OPEN — AUTOMATION DISABLED)
   *    YES ↓
   * SELECT SAVED MOTOR PROFILE
   *         ↓
   * CALCULATE REQUIRED MOTOR MOVEMENT (Δ = newTarget - prevTarget)
   *         ↓
   * EXECUTE EXISTING MOTOR CONTROL FUNCTION (Move only difference)
   *         ↓
   * CONTINUE MONITORING
   */
  useEffect(() => {
    // 1. Hardware connection & sensor health check
    if (connectionState !== 'CONNECTED' || stats.currentRaw === null) {
      if (connectionState !== 'CONNECTED') {
        setSystemState('SENSOR ERROR');
        setErrorMessage('ESP32 not connected. USB Serial connection required.');
      }
      return;
    }

    // 2. CHECK CAP STATE:
    // If Cap is OPEN: IMMEDIATELY DISABLE automatic motor adjustments.
    // Continue monitoring load-cell readings for display, but NEVER automatically rotate motor!
    if (capState === 'OPEN') {
      setSystemState('CAP OPEN — AUTOMATION DISABLED');
      setMotorDirection('IDLE');
      setRequiredAdjustment(0);
      setErrorMessage(null);
      return;
    }

    // 3. CAP IS CLOSED: Automatic motor control is ACTIVE!
    const confirmedPoints = calibrationPoints.filter((p) => p.status === 'CONFIRMED');
    if (confirmedPoints.length < 2) {
      setSystemState('SENSOR ERROR');
      setErrorMessage('Liquid volume uncalibrated. At least 2 calibration points required.');
      return;
    }

    if (!motorProfiles || motorProfiles.length === 0) {
      setSystemState('SENSOR ERROR');
      setErrorMessage('No motor profiles configured. Configure profiles in Motor Configuration.');
      return;
    }

    setErrorMessage(null);

    // 4. Calculate Current Volume
    const volumeMl = volumeInterpolation.volumeMl;
    if (volumeMl === null) {
      setSystemState('MONITORING LIQUID LEVEL');
      return;
    }

    // 5. Select Saved Motor Profile for Current Volume
    const profileResult = interpolateMotorAction('CLOSE', volumeMl, motorProfiles);
    if (!profileResult) {
      setSystemState('SENSOR ERROR');
      return;
    }

    const targetAngle = profileResult.degrees;
    const profileDirection = profileResult.direction;
    setSelectedProfileName(profileResult.profileDescription);
    setTargetMotorPosition(targetAngle);

    // If initial commanded target is not set, initialize it
    if (lastCommandedTargetAngleRef.current === null) {
      lastCommandedTargetAngleRef.current = targetAngle;
      setSystemState('MONITORING LIQUID LEVEL');
      return;
    }

    // 6. Calculate Required Movement: Difference between new target and last successfully commanded target
    const prevTarget = lastCommandedTargetAngleRef.current;
    const diff = Math.round((targetAngle - prevTarget) * 10) / 10;
    setRequiredAdjustment(diff);

    // 7. Check Deadband: Ignore insignificant load-cell fluctuations
    if (Math.abs(diff) < config.angleDeadband) {
      setMotorDirection('IDLE');
      if (isMotorMoving || isExecutingAdjustmentRef.current) {
        setSystemState('AUTOMATIC MOTOR ADJUSTING');
      } else {
        setSystemState('MOTOR STABLE');
      }
      return;
    }

    // 8. Difference exceeds deadband: Liquid level changed!
    // Direction: if diff > 0, move in configured profileDirection; if diff < 0, move opposite
    const proposedDirection: MotorDirection =
      diff > 0 ? profileDirection : profileDirection === 'CW' ? 'CCW' : 'CW';
    setMotorDirection(proposedDirection);

    // If motor is currently moving, wait for completion
    if (isMotorMoving || isExecutingAdjustmentRef.current || serialService.isMotorRunning()) {
      setSystemState('AUTOMATIC MOTOR ADJUSTING');
      return;
    }

    // Stability gate: do not move motor on unstable readings
    if (stats.stability === 'UNSTABLE') {
      setSystemState('LIQUID LEVEL CHANGED');
      return;
    }

    // Rate limiting: enforce settling interval between motor adjustments
    const now = Date.now();
    if (now - lastAdjustmentTimeRef.current < config.minAdjustmentInterval) {
      setSystemState('LIQUID LEVEL CHANGED');
      return;
    }

    // 9. Execute Required Difference Only using existing motor control function
    const degToMove = Math.round(Math.abs(diff));
    if (degToMove < 1) {
      setSystemState('MOTOR STABLE');
      setMotorDirection('IDLE');
      return;
    }

    isExecutingAdjustmentRef.current = true;
    lastAdjustmentTimeRef.current = now;
    setLastAdjustmentTime(now);
    setSystemState('AUTOMATIC MOTOR ADJUSTING');

    const details = `Auto adjust: moved ${degToMove}° ${proposedDirection} (target ${prevTarget}° -> ${targetAngle}°, vol ${volumeMl.toFixed(1)} ml)`;
    setLastAdjustmentDetails(details);

    (async () => {
      try {
        if (onRotate) {
          await onRotate('CLOSE', degToMove, proposedDirection);
        } else {
          await serialService.sendCommand(`CLOSE,${degToMove},${proposedDirection}`);
        }

        // Wait for motor completion signal from ESP32
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            sub();
            resolve();
          }, Math.max(6000, degToMove * 25));

          const sub = serialService.subscribe((ev) => {
            if (ev.type === 'MOTOR_COMPLETED' || ev.type === 'ERROR') {
              clearTimeout(timeout);
              sub();
              resolve();
            }
          });
        });

        // Update successfully commanded target position
        lastCommandedTargetAngleRef.current = targetAngle;
        currentPosRef.current = targetAngle;
        setCurrentMotorPosition(targetAngle);
        StorageService.saveMotorPosition(targetAngle);

        setSystemState('MOTOR STABLE');
        setMotorDirection('IDLE');

        addEventToHistory({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          type: 'AUTO_ADJUST',
          mode: 'AUTOMATIC',
          volumeMl,
          degrees: degToMove,
          direction: proposedDirection,
          status: 'SUCCESS',
          details,
        });
      } catch (err: any) {
        setSystemState('SENSOR ERROR');
        setErrorMessage(`Automatic adjustment error: ${err.message}`);
      } finally {
        isExecutingAdjustmentRef.current = false;
      }
    })();
  }, [
    capState,
    connectionState,
    volumeInterpolation.volumeMl,
    stats.stability,
    stats.currentRaw,
    calibrationPoints,
    motorProfiles,
    isMotorMoving,
    config,
    onRotate,
    addEventToHistory,
  ]);

  /**
   * CAP CLOSE ACTION:
   * 1. Execute configured CLOSE motor operation.
   * 2. Set cap state to CLOSED.
   * 3. Enable continuous automatic motor control.
   * 4. Continue monitoring & adjusting on volume changes.
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

      // Set cap state to CLOSED and enable continuous automatic mode
      setCapState('CLOSED');
      StorageService.saveCapState('CLOSED');
      setMode('AUTOMATIC');

      if (event.degrees !== null) {
        lastCommandedTargetAngleRef.current = event.degrees;
        currentPosRef.current = event.degrees;
        setCurrentMotorPosition(event.degrees);
        StorageService.saveMotorPosition(event.degrees);
      }

      setSystemState('CAP CLOSED — AUTOMATION ACTIVE');
    } catch (err: any) {
      console.error('Cap Close execution error:', err);
    } finally {
      isExecutingAdjustmentRef.current = false;
    }
  }, [isMotorMoving, readings, calibrationPoints, motorProfiles, onRotate, addEventToHistory]);

  /**
   * CAP OPEN ACTION:
   * 1. Immediately disable automatic motor adjustments.
   * 2. Execute configured OPEN motor operation.
   * 3. Set cap state to OPEN.
   * 4. Continue monitoring load-cell readings for dashboard display.
   * 5. NEVER automatically rotate motor while cap is open.
   */
  const triggerCapOpen = useCallback(async () => {
    if (isMotorMoving || isExecutingAdjustmentRef.current) return;

    // Immediately disable automatic motor adjustments
    setCapState('OPEN');
    StorageService.saveCapState('OPEN');
    setMode('MANUAL');
    lastCommandedTargetAngleRef.current = null;
    setSystemState('CAP OPEN — AUTOMATION DISABLED');
    setMotorDirection('IDLE');
    setRequiredAdjustment(0);

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
      console.error('Cap Open execution error:', err);
    } finally {
      isExecutingAdjustmentRef.current = false;
    }
  }, [isMotorMoving, readings, calibrationPoints, motorProfiles, onRotate, addEventToHistory]);

  /**
   * Emergency Motor Stop: Immediately cuts motor driver and disables automation
   */
  const triggerEmergencyStop = useCallback(async () => {
    isExecutingAdjustmentRef.current = false;
    setCapState('OPEN');
    StorageService.saveCapState('OPEN');
    setMode('MANUAL');
    setSystemState('CAP OPEN — AUTOMATION DISABLED');
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
   * Zero / Calibrate motor reference angle
   */
  const zeroMotorPosition = useCallback(async () => {
    setCurrentMotorPosition(0);
    currentPosRef.current = 0;
    lastCommandedTargetAngleRef.current = 0;
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

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const updateConfig = useCallback((updates: Partial<typeof config>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Aggregated state object for UI
  const feedbackState: AutomationFeedbackState = {
    capState,
    isAutomationEnabled: capState === 'CLOSED',
    systemState,
    mode: (capState === 'CLOSED' ? 'AUTOMATIC' : 'MANUAL') as OperatingMode,
    status:
      systemState === 'AUTOMATIC MOTOR ADJUSTING'
        ? 'ADJUSTING'
        : systemState === 'MOTOR STABLE'
        ? 'STABLE'
        : systemState === 'SENSOR ERROR'
        ? 'ERROR'
        : 'MONITORING',
    liveRaw: stats.currentRaw,
    filteredRaw: stats.filteredRaw !== null ? stats.filteredRaw : stats.average,
    calculatedVolumeMl: volumeInterpolation.volumeMl,
    currentMotorPosition,
    targetMotorPosition,
    lastCommandedTargetAngle: lastCommandedTargetAngleRef.current,
    requiredAdjustment,
    motorDirection,
    selectedProfileName,
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
    capState,
    setCapState,
    systemState,
    isAutomationEnabled: capState === 'CLOSED',
    mode: (capState === 'CLOSED' ? 'AUTOMATIC' : 'MANUAL') as OperatingMode,
    setMode,
    status: feedbackState.status,
    currentMotorPosition,
    targetMotorPosition,
    requiredAdjustment,
    motorDirection,
    selectedProfileName,
    lastAdjustmentTime,
    lastAdjustmentDetails,
    isMotorMoving,
    isRunning: isMotorMoving,
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
