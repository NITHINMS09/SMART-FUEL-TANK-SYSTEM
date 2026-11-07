import { useState, useEffect, useCallback } from 'react';
import { serialService, SerialEvent } from '../services/serialService';
import { StorageService } from '../services/storageService';
import { sortCalibrationPoints, MAX_CALIBRATION_POINTS } from '../services/calibrationService';
import { CalibrationPoint, RawReading } from '../types';

export function useCalibration() {
  const [points, setPoints] = useState<CalibrationPoint[]>(() => {
    return StorageService.loadCalibrationPoints();
  });
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [pendingPoint, setPendingPoint] = useState<CalibrationPoint | null>(null);
  const [lastSavedMessage, setLastSavedMessage] = useState<string | null>(null);

  // Sync state to storage
  useEffect(() => {
    StorageService.saveCalibrationPoints(points);
  }, [points]);

  // Subscribe to ESP32 responses
  useEffect(() => {
    const unsubscribe = serialService.subscribe((event: SerialEvent) => {
      if (event.type === 'CAL_ACCEPTED') {
        setPoints((prev) => {
          if (!pendingPoint) return prev;
          const updated = prev.filter((p) => p.volumeMl !== pendingPoint.volumeMl);
          const confirmed: CalibrationPoint = {
            ...pendingPoint,
            status: 'CONFIRMED',
            syncedToESP: true,
          };
          return sortCalibrationPoints([...updated, confirmed]);
        });
        setPendingPoint(null);
        setIsCalibrating(false);
        setCalibrationError(null);
        setLastSavedMessage('Calibration accepted and verified by ESP32!');
      } else if (event.type === 'CAL_REJECTED') {
        setIsCalibrating(false);
        setPendingPoint(null);
        setCalibrationError(`Calibration REJECTED by ESP32 firmware: ${event.reason || 'Unstable sensor readings'}`);
      } else if (event.type === 'CAL_RESULT') {
        // If ESP32 firmware calculated the calibration result
        setPendingPoint((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            volumeMl: event.ml,
            averageRaw: event.average,
            minimum: event.minimum,
            maximum: event.maximum,
            range: event.range,
          };
        });
      } else if (event.type === 'CALIBRATION_SAVED') {
        setLastSavedMessage('ESP32 NVS confirmed calibration saved.');
      } else if (event.type === 'CAL_POINT') {
        // Received during GET_DATA synchronization
        setPoints((prev) => {
          const exists = prev.some((p) => p.volumeMl === event.ml && p.averageRaw === event.average);
          if (exists) return prev;
          const item: CalibrationPoint = {
            id: Math.random().toString(36).substring(2, 9),
            volumeMl: event.ml,
            averageRaw: event.average,
            minimum: event.minimum,
            maximum: event.maximum,
            range: event.range,
            status: 'CONFIRMED',
            timestamp: Date.now(),
            syncedToESP: true,
          };
          return sortCalibrationPoints([...prev.filter((p) => p.volumeMl !== event.ml), item]);
        });
      }
    });

    return unsubscribe;
  }, [pendingPoint]);

  /**
   * Initiate calibration workflow for a given volume:
   * Captures 20 readings from the live stream, validates stability, and sends CAL,<ml> to ESP32.
   */
  const startCalibrationCapture = useCallback(
    async (volumeMl: number, currentReadings: RawReading[], stabilityThreshold: number = 50) => {
      setCalibrationError(null);
      setLastSavedMessage(null);

      if (volumeMl < 0 || isNaN(volumeMl)) {
        setCalibrationError('Volume must be a non-negative number in ml.');
        return false;
      }

      if (points.length >= MAX_CALIBRATION_POINTS && !points.some(p => p.volumeMl === volumeMl)) {
        setCalibrationError(`Cannot exceed ESP32 maximum limit of ${MAX_CALIBRATION_POINTS} calibration points.`);
        return false;
      }

      if (currentReadings.length < 20) {
        setCalibrationError(`Insufficient sensor readings: ${currentReadings.length}/20 captured. Please wait for 20 readings.`);
        return false;
      }

      // Compute statistics over latest 20 readings
      const windowReadings = currentReadings.slice(-20);
      const rawValues = windowReadings.map((r) => r.raw);
      const min = Math.min(...rawValues);
      const max = Math.max(...rawValues);
      const sum = rawValues.reduce((a, b) => a + b, 0);
      const avg = Math.round(sum / rawValues.length);
      const range = max - min;

      if (range > stabilityThreshold) {
        setCalibrationError(`Readings are UNSTABLE! Range is ${range} (threshold is ${stabilityThreshold}). Stabilize the tank before calibrating.`);
        return false;
      }

      const pointToConfirm: CalibrationPoint = {
        id: Math.random().toString(36).substring(2, 9),
        volumeMl,
        averageRaw: avg,
        minimum: min,
        maximum: max,
        range,
        status: 'UNSAVED',
        timestamp: Date.now(),
        syncedToESP: false,
      };

      setPendingPoint(pointToConfirm);
      setIsCalibrating(true);

      try {
        // Send CAL,<ml> command to ESP32
        await serialService.sendCommand(`CAL,${Math.round(volumeMl)}`);
        return true;
      } catch (err: any) {
        setIsCalibrating(false);
        setPendingPoint(null);
        setCalibrationError(`Failed to send CAL command to ESP32: ${err.message}`);
        return false;
      }
    },
    [points]
  );

  /**
   * Delete a calibration point
   */
  const deletePoint = useCallback(async (id: string) => {
    setPoints((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /**
   * Edit an existing calibration point (volume ml)
   */
  const updatePoint = useCallback((id: string, newVolumeMl: number) => {
    setPoints((prev) => {
      const updated = prev.map((p) => {
        if (p.id === id) {
          return { ...p, volumeMl: newVolumeMl };
        }
        return p;
      });
      return sortCalibrationPoints(updated);
    });
  }, []);

  /**
   * Replace all points (e.g. from JSON backup import or full ESP32 sync)
   */
  const replaceAllPoints = useCallback((newPoints: CalibrationPoint[]) => {
    setPoints(sortCalibrationPoints(newPoints));
  }, []);

  return {
    points,
    isCalibrating,
    calibrationError,
    pendingPoint,
    lastSavedMessage,
    startCalibrationCapture,
    deletePoint,
    updatePoint,
    replaceAllPoints,
    setCalibrationError,
  };
}

