import { useState, useEffect, useCallback } from 'react';
import { AutomationEvent, CalibrationPoint, MotorDirection, MotorProfile, OperatingMode, RawReading } from '../types';
import { AutomationService, AutoCloseProgress } from '../services/automationService';
import { StorageService } from '../services/storageService';

export function useAutomation(
  readings: RawReading[],
  calibrationPoints: CalibrationPoint[],
  motorProfiles: MotorProfile[]
) {
  const [mode, setMode] = useState<OperatingMode>('MANUAL');
  const [history, setHistory] = useState<AutomationEvent[]>(() => {
    return StorageService.loadAutomationHistory();
  });
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<AutoCloseProgress>({
    stage: 'IDLE',
    measuredVolumeMl: null,
    targetDegrees: null,
    targetDirection: null,
    errorMessage: null,
  });

  // Sync history to storage
  useEffect(() => {
    StorageService.saveAutomationHistory(history);
  }, [history]);

  const addEventToHistory = useCallback((event: AutomationEvent) => {
    setHistory((prev) => [event, ...prev].slice(0, 100));
  }, []);

  const triggerCapClose = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);

    try {
      if (mode === 'AUTOMATIC') {
        const event = await AutomationService.executeAutoClose(
          readings,
          calibrationPoints,
          motorProfiles,
          (prog) => setProgress(prog)
        );
        addEventToHistory(event);
      } else {
        // Manual mode close (e.g. default 180 CCW or from nearest profile)
        const event = await AutomationService.executeCapClose(180, 'CCW', 'MANUAL');
        addEventToHistory(event);
      }
    } finally {
      setIsRunning(false);
      setTimeout(() => {
        setProgress((prev) => ({ ...prev, stage: 'IDLE' }));
      }, 5000);
    }
  }, [isRunning, mode, readings, calibrationPoints, motorProfiles, addEventToHistory]);

  const triggerCapOpen = useCallback(
    async (degrees: number = 90, direction: MotorDirection = 'CW') => {
      if (isRunning) return;
      setIsRunning(true);

      try {
        const event = await AutomationService.executeCapOpen(degrees, direction, mode);
        addEventToHistory(event);
      } finally {
        setIsRunning(false);
      }
    },
    [isRunning, mode, addEventToHistory]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    mode,
    setMode,
    history,
    isRunning,
    progress,
    triggerCapClose,
    triggerCapOpen,
    clearHistory,
    addEventToHistory,
  };
}

