import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { serialService, SerialEvent } from '../services/serialService';
import { calculateLoadCellStats, interpolateVolumeFromRaw } from '../services/calibrationService';
import { CalibrationPoint, InterpolationResult, LoadCellStats, RawReading } from '../types';

export interface VolumeHistoryPoint {
  timestamp: number;
  volumeMl: number;
}

export function useLoadCell(
  calibrationPoints: CalibrationPoint[] = [],
  initialThreshold: number = 50,
  windowSize: number = 20
) {
  const [readings, setReadings] = useState<RawReading[]>([]);
  const [stabilityThreshold, setStabilityThreshold] = useState<number>(initialThreshold);
  const [volumeHistory, setVolumeHistory] = useState<VolumeHistoryPoint[]>([]);

  // Exponential Moving Average filter reference for rock-solid volume calculation
  // alpha = 0.2 provides responsive tracking while dampening random HX711 24-bit noise
  const emaRawRef = useRef<number | null>(null);
  const filteredRawState = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = serialService.subscribe((event: SerialEvent) => {
      if (event.type === 'RAW_READING') {
        const item: RawReading = {
          raw: event.raw,
          timestamp: event.timestamp,
        };

        // Update exponential moving average filter
        const alpha = 0.2;
        if (emaRawRef.current === null) {
          emaRawRef.current = event.raw;
        } else {
          emaRawRef.current = alpha * event.raw + (1 - alpha) * emaRawRef.current;
        }
        filteredRawState.current = Math.round(emaRawRef.current);

        setReadings((prev) => {
          const next = [...prev, item];
          // Keep up to 60 readings for chart history
          if (next.length > 60) {
            return next.slice(-60);
          }
          return next;
        });
      }
    });

    return unsubscribe;
  }, []);

  const clearReadings = useCallback(() => {
    setReadings([]);
    emaRawRef.current = null;
    filteredRawState.current = null;
    setVolumeHistory([]);
  }, []);

  // Compute 20-sample window stats and include noise-filtered raw value
  const stats: LoadCellStats = useMemo(() => {
    return calculateLoadCellStats(
      readings,
      stabilityThreshold,
      windowSize,
      filteredRawState.current
    );
  }, [readings, stabilityThreshold, windowSize]);

  // Interpolate water volume strictly based on confirmed calibration points and filtered raw reading
  const volumeInterpolation: InterpolationResult = useMemo(() => {
    // Prefer filtered raw reading to prevent volume display jumping; fallback to window average
    const targetRaw = stats.filteredRaw !== null ? stats.filteredRaw : stats.average;
    return interpolateVolumeFromRaw(targetRaw, calibrationPoints, stabilityThreshold);
  }, [stats.filteredRaw, stats.average, calibrationPoints, stabilityThreshold]);

  // Continuously record volume history whenever valid interpolation is available (including 0 ml)
  useEffect(() => {
    if (volumeInterpolation.volumeMl !== null && typeof volumeInterpolation.volumeMl === 'number') {
      const vol = volumeInterpolation.volumeMl;
      const now = Date.now();
      setVolumeHistory((prev) => {
        // Prevent duplicate timestamps within 100ms
        if (prev.length > 0 && now - prev[prev.length - 1].timestamp < 100) {
          const updated = [...prev];
          updated[updated.length - 1] = { timestamp: now, volumeMl: vol };
          return updated;
        }
        const next = [...prev, { timestamp: now, volumeMl: vol }];
        return next.length > 50 ? next.slice(-50) : next;
      });
    }
  }, [volumeInterpolation.volumeMl]);

  return {
    readings,
    stats,
    volumeInterpolation,
    volumeHistory,
    stabilityThreshold,
    setStabilityThreshold,
    clearReadings,
  };
}

