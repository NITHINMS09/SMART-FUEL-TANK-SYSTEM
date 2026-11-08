import { useState, useEffect, useCallback, useRef } from 'react';
import { serialService, SerialEvent } from '../services/serialService';
import { StorageService } from '../services/storageService';
import { sortCalibrationPoints, MAX_CALIBRATION_POINTS } from '../services/calibrationService';
import { CalibrationPoint, CalResultData, CalibrationDebugLog, RawReading } from '../types';

export function useCalibration() {
  const [points, setPoints] = useState<CalibrationPoint[]>(() => {
    return StorageService.loadCalibrationPoints();
  });
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [lastSavedMessage, setLastSavedMessage] = useState<string | null>(null);
  const [latestCalResult, setLatestCalResult] = useState<CalResultData | null>(null);
  const [calProcessingStatus, setCalProcessingStatus] = useState<string>('Ready for calibration command.');
  const [debugLogs, setDebugLogs] = useState<CalibrationDebugLog[]>([]);

  // Synchronous session ref to guarantee data survives across microsecond event batches without closure lag
  const sessionRef = useRef<{
    volumeMl: number;
    latestResult?: CalResultData;
    timeoutId?: any;
    startTime: number;
    accepted?: boolean;
    saved?: boolean;
  } | null>(null);

  // Persistent reference to latest parsed calibration result
  const latestCalResultRef = useRef<CalResultData | null>(null);

  // Sync points state to persistent browser storage
  useEffect(() => {
    StorageService.saveCalibrationPoints(points);
  }, [points]);

  const addDebugLog = useCallback((type: CalibrationDebugLog['type'], message: string, payload?: any) => {
    setDebugLogs((prev) => [
      ...prev.slice(-199), // Keep latest 200 logs
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type,
        message,
        payload,
      },
    ]);
  }, []);

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  // Subscribe to ESP32 responses
  useEffect(() => {
    const unsubscribe = serialService.subscribe((event: SerialEvent) => {
      // 0. Handle Disconnection during active calibration
      if (event.type === 'STATE_CHANGED' && event.state !== 'CONNECTED') {
        if (sessionRef.current?.timeoutId) {
          clearTimeout(sessionRef.current.timeoutId);
        }
        sessionRef.current = null;
        setIsCalibrating(false);
        setCalProcessingStatus('ESP32 disconnected.');
        return;
      }

      // Log all serial traffic relevant to calibration
      if (event.type === 'RAW_MESSAGE') {
        const msg = event.message;
        const upperText = msg.text.trim().toUpperCase();
        if (msg.direction === 'TX') {
          if (upperText.startsWith('CAL,') || upperText === 'GET_DATA') {
            addDebugLog('TX', `[TX] ${msg.text}`);
          }
        } else if (msg.direction === 'RX') {
          if (
            upperText.startsWith('CAL_') ||
            upperText.startsWith('CALIBRATION_') ||
            upperText.startsWith('ERROR')
          ) {
            addDebugLog('RX', `[RX] ${msg.text}`);
          }
        }
      }

      // Helper to finalize calibration point storage and unlock session
      const finalizeCalibrationPoint = (res: CalResultData, fallbackVol?: number) => {
        const vol =
          typeof res.volumeMl === 'number' && !isNaN(res.volumeMl)
            ? res.volumeMl
            : typeof fallbackVol === 'number' && !isNaN(fallbackVol)
            ? fallbackVol
            : 0;

        const avg = res.averageRaw;
        const min = res.minimum;
        const max = res.maximum;
        const range = res.range;

        const confirmedPoint: CalibrationPoint = {
          id: Math.random().toString(36).substring(2, 9),
          volumeMl: vol,
          averageRaw: avg,
          minimum: min,
          maximum: max,
          range,
          status: 'CONFIRMED',
          timestamp: Date.now(),
          syncedToESP: true,
        };

        // Update points in state immediately
        setPoints((prev) => {
          const filtered = prev.filter((p) => Math.abs(p.volumeMl - vol) > 0.001);
          return sortCalibrationPoints([...filtered, confirmedPoint]);
        });

        if (sessionRef.current?.timeoutId) {
          clearTimeout(sessionRef.current.timeoutId);
          sessionRef.current.timeoutId = undefined;
        }
        sessionRef.current = null;
        setIsCalibrating(false);
        setCalibrationError(null);

        const acceptedMsg = `CAL_ACCEPTED: Reference point for ${vol} ml accepted and confirmed saved to ESP32 NVS!`;
        setLastSavedMessage(acceptedMsg);
        setCalProcessingStatus(acceptedMsg);
        addDebugLog('STATUS', acceptedMsg, confirmedPoint);
      };

      // 1. CAL_RESULT: parsed statistics from ESP32
      if (event.type === 'CAL_RESULT') {
        const resData: CalResultData = {
          volumeMl: event.ml,
          averageRaw: event.average,
          minimum: event.minimum,
          maximum: event.maximum,
          range: event.range,
          timestamp: Date.now(),
        };

        // Update UI immediately (Requirement 7)
        latestCalResultRef.current = resData;
        setLatestCalResult(resData);
        setCalibrationError(null);
        const statusMsg = `CAL_RESULT received: Volume=${event.ml} ml, Average=${event.average}, Min=${event.minimum}, Max=${event.maximum}, Range=${event.range}`;
        setCalProcessingStatus(statusMsg);
        addDebugLog('STATUS', statusMsg, resData);

        // Update synchronous session reference
        if (sessionRef.current) {
          sessionRef.current.latestResult = resData;

          // If confirmation was already received before or with CAL_RESULT:
          if (sessionRef.current.accepted || sessionRef.current.saved) {
            finalizeCalibrationPoint(resData, sessionRef.current.volumeMl);
            return;
          }

          // Clear initial command timeout and start a 6-second confirmation timeout for CAL_ACCEPTED / CAL_REJECTED
          if (sessionRef.current.timeoutId) {
            clearTimeout(sessionRef.current.timeoutId);
          }
          sessionRef.current.timeoutId = setTimeout(() => {
            setIsCalibrating(false);
            const errMsg = `Timeout waiting for ESP32 confirmation (CAL_ACCEPTED / CAL_REJECTED) after CAL_RESULT for ${sessionRef.current?.volumeMl ?? event.ml} ml.`;
            setCalibrationError(errMsg);
            setCalProcessingStatus(errMsg);
            addDebugLog('TIMEOUT', errMsg);
            sessionRef.current = null;
          }, 6000);
        } else {
          sessionRef.current = {
            volumeMl: event.ml,
            latestResult: resData,
            startTime: Date.now(),
          };
        }
      }

      // 2. CAL_ACCEPTED: firmware confirmed reading stability and saved calibration point to NVS
      else if (event.type === 'CAL_ACCEPTED') {
        if (sessionRef.current) {
          sessionRef.current.accepted = true;
          if (sessionRef.current.latestResult) {
            finalizeCalibrationPoint(sessionRef.current.latestResult, sessionRef.current.volumeMl);
          } else {
            const waitMsg = 'CAL_ACCEPTED received from ESP32. Finalizing with incoming CAL_RESULT...';
            setCalProcessingStatus(waitMsg);
            addDebugLog('STATUS', waitMsg);
          }
        } else if (latestCalResultRef.current) {
          // If no active session ref (e.g. unsolicited or delayed arrival)
          finalizeCalibrationPoint(latestCalResultRef.current);
        }
      }

      // 3. CALIBRATION_SAVED: firmware confirmed permanent save to ESP32 Preferences/NVS
      else if (event.type === 'CALIBRATION_SAVED') {
        if (sessionRef.current) {
          sessionRef.current.saved = true;
          if (sessionRef.current.latestResult) {
            finalizeCalibrationPoint(sessionRef.current.latestResult, sessionRef.current.volumeMl);
          } else {
            const savedMsg = 'CALIBRATION_SAVED: Permanent flash NVS write confirmed by ESP32.';
            setLastSavedMessage(savedMsg);
            setCalProcessingStatus(savedMsg);
            addDebugLog('STATUS', savedMsg);
          }
        } else {
          const savedMsg = 'CALIBRATION_SAVED: Permanent flash NVS write confirmed by ESP32.';
          setLastSavedMessage(savedMsg);
          setCalProcessingStatus(savedMsg);
          addDebugLog('STATUS', savedMsg);
        }
      }

      // 4. CALIBRATION_COUNT: number of points stored in ESP32 NVS
      else if (event.type === 'CALIBRATION_COUNT') {
        const countMsg = `CALIBRATION_COUNT: ESP32 NVS now contains ${event.count} calibration points.`;
        setCalProcessingStatus(countMsg);
        addDebugLog('STATUS', countMsg);
      }

      // 5. CAL_REJECTED: firmware rejected calibration due to instability or flash failure
      else if (event.type === 'CAL_REJECTED') {
        if (sessionRef.current?.timeoutId) {
          clearTimeout(sessionRef.current.timeoutId);
          sessionRef.current.timeoutId = undefined;
        }
        sessionRef.current = null;
        setIsCalibrating(false);
        const errMsg = `CAL_REJECTED by ESP32 firmware: ${event.reason || 'UNSTABLE'}. Sensor readings fluctuated beyond stability threshold or NVS save failed.`;
        setCalibrationError(errMsg);
        setCalProcessingStatus(errMsg);
        addDebugLog('ERROR', errMsg);
      }

      // 6. ERROR: ESP32 hardware or command error
      else if (event.type === 'ERROR') {
        if (sessionRef.current?.timeoutId) {
          clearTimeout(sessionRef.current.timeoutId);
          sessionRef.current.timeoutId = undefined;
        }
        sessionRef.current = null;
        setIsCalibrating(false);
        const errMsg = `ESP32 Hardware Error: ${event.message}`;
        setCalibrationError(errMsg);
        setCalProcessingStatus(errMsg);
        addDebugLog('ERROR', errMsg);
      }

      // 7. CAL_POINT: synchronization response from GET_DATA
      else if (event.type === 'CAL_POINT') {
        setPoints((prev) => {
          const exists = prev.some((p) => Math.abs(p.volumeMl - event.ml) < 0.001 && p.averageRaw === event.average);
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
          return sortCalibrationPoints([...prev.filter((p) => Math.abs(p.volumeMl - event.ml) > 0.001), item]);
        });
      }
    });

    return unsubscribe;
  }, [addDebugLog]);

  /**
   * Cancel calibration sampling manually and unlock UI
   */
  const cancelCalibration = useCallback(() => {
    if (sessionRef.current?.timeoutId) {
      clearTimeout(sessionRef.current.timeoutId);
    }
    sessionRef.current = null;
    setIsCalibrating(false);
    const cancelMsg = 'Calibration sampling cancelled by user. Ready for new command.';
    setCalibrationError(cancelMsg);
    setCalProcessingStatus(cancelMsg);
    addDebugLog('STATUS', cancelMsg);
  }, [addDebugLog]);

  /**
   * Initiate calibration: Sends CAL,<ml> directly to ESP32.
   * Continuous serial reader is kept running without interruption or duplicate reader locks.
   */
  const startCalibrationCapture = useCallback(
    async (volumeMl: number, _recentReadings?: RawReading[], _threshold?: number) => {
      setCalibrationError(null);
      setLastSavedMessage(null);

      // Prevent duplicate calibration triggers
      if (isCalibrating || sessionRef.current !== null) {
        console.warn('[Calibration] Calibration capture already in progress. Ignoring duplicate call.');
        return false;
      }

      if (typeof volumeMl !== 'number' || isNaN(volumeMl) || volumeMl < 0) {
        const err = 'Volume must be a non-negative number in ml (0 or greater).';
        setCalibrationError(err);
        addDebugLog('ERROR', err);
        return false;
      }

      if (points.length >= MAX_CALIBRATION_POINTS && !points.some((p) => Math.abs(p.volumeMl - volumeMl) < 0.001)) {
        const err = `Cannot exceed ESP32 maximum limit of ${MAX_CALIBRATION_POINTS} calibration points.`;
        setCalibrationError(err);
        addDebugLog('ERROR', err);
        return false;
      }

      const volStr = Number.isInteger(volumeMl) ? volumeMl.toString() : volumeMl.toFixed(1);
      const cmdToSend = `CAL,${volStr}`;

      setIsCalibrating(true);
      const startMsg = `Transmitting ${cmdToSend} to ESP32...`;
      setCalProcessingStatus(startMsg);
      addDebugLog('TX', `Initiating calibration: ${cmdToSend}`);

      // Initialize session ref
      sessionRef.current = {
        volumeMl,
        startTime: Date.now(),
        accepted: false,
        saved: false,
      };

      // 8-second response timeout (ESP32 samples 20 readings in ~2s)
      const timeoutId = setTimeout(() => {
        setIsCalibrating(false);
        const timeoutMsg = `Calibration Timeout: No CAL_RESULT response received from ESP32 for '${cmdToSend}' after 8 seconds. Verify USB connection.`;
        setCalibrationError(timeoutMsg);
        setCalProcessingStatus(timeoutMsg);
        addDebugLog('TIMEOUT', timeoutMsg);
        sessionRef.current = null;
      }, 8000);

      sessionRef.current.timeoutId = timeoutId;

      try {
        await serialService.sendCommand(cmdToSend);
        setCalProcessingStatus(`Sampling 20 readings on ESP32 for ${volStr} ml...`);
        return true;
      } catch (err: any) {
        if (sessionRef.current?.timeoutId) {
          clearTimeout(sessionRef.current.timeoutId);
        }
        sessionRef.current = null;
        setIsCalibrating(false);
        const sendErrMsg = `Failed to send CAL command to ESP32: ${err.message}`;
        setCalibrationError(sendErrMsg);
        setCalProcessingStatus(sendErrMsg);
        addDebugLog('ERROR', sendErrMsg);
        return false;
      }
    },
    [points, isCalibrating, addDebugLog]
  );

  /**
   * Delete a calibration point (syncs with ESP32 NVS if connected)
   */
  const deletePoint = useCallback(async (id: string) => {
    const pt = points.find((p) => p.id === id);
    if (pt && serialService.getState() === 'CONNECTED') {
      try {
        const volStr = Number.isInteger(pt.volumeMl) ? pt.volumeMl.toString() : pt.volumeMl.toFixed(1);
        await serialService.sendCommand(`DEL_CAL,${volStr}`);
      } catch (e) {
        console.warn('Failed to delete calibration point on ESP32:', e);
      }
    }
    setPoints((prev) => prev.filter((p) => p.id !== id));
  }, [points]);

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
    lastSavedMessage,
    latestCalResult,
    calProcessingStatus,
    debugLogs,
    startCalibrationCapture,
    cancelCalibration,
    deletePoint,
    updatePoint,
    replaceAllPoints,
    clearDebugLogs,
    setCalibrationError,
  };
}
