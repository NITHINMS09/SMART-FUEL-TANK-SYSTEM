import { useState, useEffect, useMemo, useCallback } from 'react';
import { serialService, SerialEvent } from '../services/serialService';
import { calculateLoadCellStats, interpolateVolumeFromRaw } from '../services/calibrationService';
import { CalibrationPoint, InterpolationResult, LoadCellStats, RawReading } from '../types';

export function useLoadCell(
  calibrationPoints: CalibrationPoint[] = [],
  initialThreshold: number = 50,
  windowSize: number = 20
) {
  const [readings, setReadings] = useState<RawReading[]>([]);
  const [stabilityThreshold, setStabilityThreshold] = useState<number>(initialThreshold);

  useEffect(() => {
    const unsubscribe = serialService.subscribe((event: SerialEvent) => {
      if (event.type === 'RAW_READING') {
        const item: RawReading = {
          raw: event.raw,
          timestamp: event.timestamp,
        };

        setReadings((prev) => {
          const next = [...prev, item];
          // Keep up to 60 readings for chart history, window analysis uses windowSize
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
  }, []);

  // Compute 20-sample window stats
  const stats: LoadCellStats = useMemo(() => {
    return calculateLoadCellStats(readings, stabilityThreshold, windowSize);
  }, [readings, stabilityThreshold, windowSize]);

  // Interpolate water volume strictly based on confirmed calibration points
  const volumeInterpolation: InterpolationResult = useMemo(() => {
    return interpolateVolumeFromRaw(stats.average, calibrationPoints);
  }, [stats.average, calibrationPoints]);

  return {
    readings,
    stats,
    volumeInterpolation,
    stabilityThreshold,
    setStabilityThreshold,
    clearReadings,
  };
}
