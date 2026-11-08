import { CalibrationPoint, InterpolationResult, LoadCellStats, RawReading, StabilityStatus } from '../types';

export const MAX_CALIBRATION_POINTS = 30;

/**
 * Calculates sliding window statistics over a list of raw readings
 */
export function calculateLoadCellStats(
  readings: RawReading[],
  stabilityThreshold: number = 50,
  targetSampleCount: number = 20,
  filteredRawValue?: number | null
): LoadCellStats {
  if (!readings || readings.length === 0) {
    return {
      currentRaw: null,
      filteredRaw: null,
      average: null,
      minimum: null,
      maximum: null,
      range: null,
      stability: 'WAITING FOR READINGS',
      sampleCount: 0,
      history: [],
    };
  }

  // Keep latest window of targetSampleCount
  const windowReadings = readings.slice(-targetSampleCount);
  const rawValues = windowReadings.map(r => r.raw);
  const currentRaw = rawValues[rawValues.length - 1];

  if (rawValues.length < targetSampleCount) {
    const min = Math.min(...rawValues);
    const max = Math.max(...rawValues);
    const sum = rawValues.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / rawValues.length);
    const range = max - min;
    const filtered = filteredRawValue !== undefined && filteredRawValue !== null ? filteredRawValue : avg;

    return {
      currentRaw,
      filteredRaw: filtered,
      average: avg,
      minimum: min,
      maximum: max,
      range,
      stability: 'WAITING FOR READINGS',
      sampleCount: rawValues.length,
      history: windowReadings,
    };
  }

  const min = Math.min(...rawValues);
  const max = Math.max(...rawValues);
  const sum = rawValues.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / rawValues.length);
  const range = max - min;
  const isStable = range <= stabilityThreshold;
  const stability: StabilityStatus = isStable ? 'STABLE' : 'UNSTABLE';
  const filtered = filteredRawValue !== undefined && filteredRawValue !== null ? filteredRawValue : avg;

  return {
    currentRaw,
    filteredRaw: filtered,
    average: avg,
    minimum: min,
    maximum: max,
    range,
    stability,
    sampleCount: rawValues.length,
    history: windowReadings,
  };
}

/**
 * Sorts calibration points by volume ascending
 */
export function sortCalibrationPoints(points: CalibrationPoint[]): CalibrationPoint[] {
  return [...points].sort((a, b) => a.volumeMl - b.volumeMl);
}

/**
 * Interpolates water volume from a raw sensor reading using calibrated points.
 * Strictly adheres to:
 * - Never show a fabricated volume when calibration data is missing (< 2 points).
 * - Supports raw readings that increase OR decrease with water volume.
 * - Uses 0 ml point as empty-tank baseline and clamps small fluctuations around baseline to 0.0 ml.
 * - Uses piecewise linear interpolation: Volume = V1 + ((CurrentRaw - R1) / (R2 - R1)) * (V2 - V1).
 * - Never extrapolates beyond calibrated values without clearly flagging out-of-range.
 */
export function interpolateVolumeFromRaw(
  raw: number | null,
  points: CalibrationPoint[],
  stabilityThreshold: number = 50
): InterpolationResult {
  if (raw === null || isNaN(raw)) {
    return {
      volumeMl: null,
      isCalibrated: false,
      isOutOfRange: false,
      statusMessage: 'No sensor reading available',
    };
  }

  const confirmedPoints = sortCalibrationPoints(
    points.filter(p => p.status === 'CONFIRMED')
  );

  if (confirmedPoints.length === 0) {
    return {
      volumeMl: null,
      isCalibrated: false,
      isOutOfRange: false,
      statusMessage: 'System uncalibrated (0 calibration points)',
    };
  }

  if (confirmedPoints.length === 1) {
    return {
      volumeMl: null,
      isCalibrated: false,
      isOutOfRange: false,
      statusMessage: `Insufficient calibration data (1 point at ${confirmedPoints[0].volumeMl} ml; minimum 2 points required)`,
    };
  }

  // Points sorted by volume ascending: P_0 (lowest vol, e.g. 0 ml) to P_{N-1} (highest vol)
  const emptyPoint = confirmedPoints[0];
  const fullPoint = confirmedPoints[confirmedPoints.length - 1];

  // Determine sensor direction: does raw reading increase or decrease with volume?
  const overallRawDelta = fullPoint.averageRaw - emptyPoint.averageRaw;
  const isDirect = overallRawDelta >= 0; // True if raw increases with volume; False if raw decreases with volume

  // Calculate acceptable noise deadband for clamping near endpoints (at least 60 raw units, up to 15% of segment)
  const totalRawSpan = Math.abs(overallRawDelta);
  const avgSegmentSpan = totalRawSpan / (confirmedPoints.length - 1);
  const noiseDeadband = Math.max(Math.min(avgSegmentSpan * 0.15, 120), Math.max(stabilityThreshold * 1.5, 60));

  // 1. EMPTY TANK BASELINE CLAMPING & OUT-OF-RANGE CHECK
  if (emptyPoint.volumeMl === 0) {
    if (isDirect) {
      // Direct slope: empty tank has low raw reading (emptyPoint.averageRaw)
      if (raw <= emptyPoint.averageRaw) {
        const drift = emptyPoint.averageRaw - raw;
        if (drift <= noiseDeadband) {
          // Normal empty-tank sensor fluctuation -> clamp smoothly to 0.0 ml without warning
          return {
            volumeMl: 0.0,
            isCalibrated: true,
            isOutOfRange: false,
            statusMessage: 'Empty tank baseline (0.0 ml)',
            lowerPoint: emptyPoint,
            upperPoint: confirmedPoints[1],
          };
        } else {
          // Exceeds acceptable empty noise threshold -> clamp to 0.0 ml and flag OUT OF RANGE
          return {
            volumeMl: 0.0,
            isCalibrated: true,
            isOutOfRange: true,
            statusMessage: `OUT OF RANGE: Below empty baseline (${raw} < ${emptyPoint.averageRaw})`,
            lowerPoint: emptyPoint,
          };
        }
      }
    } else {
      // Inverted slope: empty tank has high raw reading (emptyPoint.averageRaw)
      if (raw >= emptyPoint.averageRaw) {
        const drift = raw - emptyPoint.averageRaw;
        if (drift <= noiseDeadband) {
          // Normal empty-tank fluctuation -> clamp smoothly to 0.0 ml
          return {
            volumeMl: 0.0,
            isCalibrated: true,
            isOutOfRange: false,
            statusMessage: 'Empty tank baseline (0.0 ml)',
            lowerPoint: emptyPoint,
            upperPoint: confirmedPoints[1],
          };
        } else {
          return {
            volumeMl: 0.0,
            isCalibrated: true,
            isOutOfRange: true,
            statusMessage: `OUT OF RANGE: Above empty baseline (${raw} > ${emptyPoint.averageRaw})`,
            lowerPoint: emptyPoint,
          };
        }
      }
    }
  }

  // 2. MAXIMUM CALIBRATED VOLUME BOUNDARY CHECK
  if (isDirect) {
    if (raw >= fullPoint.averageRaw) {
      const overage = raw - fullPoint.averageRaw;
      if (overage <= noiseDeadband) {
        return {
          volumeMl: fullPoint.volumeMl,
          isCalibrated: true,
          isOutOfRange: false,
          statusMessage: `Calibrated full tank (${fullPoint.volumeMl} ml)`,
          lowerPoint: confirmedPoints[confirmedPoints.length - 2],
          upperPoint: fullPoint,
        };
      } else {
        return {
          volumeMl: fullPoint.volumeMl,
          isCalibrated: true,
          isOutOfRange: true,
          statusMessage: `OUT OF RANGE: Above maximum calibrated point (${raw} > ${fullPoint.averageRaw})`,
          upperPoint: fullPoint,
        };
      }
    }
  } else {
    // Inverted slope: full tank has lowest raw reading
    if (raw <= fullPoint.averageRaw) {
      const overage = fullPoint.averageRaw - raw;
      if (overage <= noiseDeadband) {
        return {
          volumeMl: fullPoint.volumeMl,
          isCalibrated: true,
          isOutOfRange: false,
          statusMessage: `Calibrated full tank (${fullPoint.volumeMl} ml)`,
          lowerPoint: confirmedPoints[confirmedPoints.length - 2],
          upperPoint: fullPoint,
        };
      } else {
        return {
          volumeMl: fullPoint.volumeMl,
          isCalibrated: true,
          isOutOfRange: true,
          statusMessage: `OUT OF RANGE: Exceeds maximum calibrated capacity (${raw} < ${fullPoint.averageRaw})`,
          upperPoint: fullPoint,
        };
      }
    }
  }

  // 3. EXACT CALIBRATION POINT MATCH
  const exact = confirmedPoints.find(p => p.averageRaw === raw);
  if (exact) {
    return {
      volumeMl: exact.volumeMl,
      isCalibrated: true,
      isOutOfRange: false,
      statusMessage: `Exact calibration match at ${exact.volumeMl} ml`,
      lowerPoint: exact,
      upperPoint: exact,
    };
  }

  // 4. PIECEWISE LINEAR INTERPOLATION BETWEEN BRACKETING POINTS
  for (let i = 0; i < confirmedPoints.length - 1; i++) {
    const p1 = confirmedPoints[i];
    const p2 = confirmedPoints[i + 1];

    const r1 = p1.averageRaw;
    const r2 = p2.averageRaw;

    const inSegment = (r1 <= raw && raw <= r2) || (r2 <= raw && raw <= r1);

    if (inSegment && r1 !== r2) {
      // Standard interpolation formula:
      // Volume = V1 + ((CurrentRaw - R1) / (R2 - R1)) * (V2 - V1)
      const ratio = (raw - r1) / (r2 - r1);
      const volume = p1.volumeMl + ratio * (p2.volumeMl - p1.volumeMl);
      const roundedVolume = Math.max(0, Math.round(volume * 10) / 10);

      return {
        volumeMl: roundedVolume,
        isCalibrated: true,
        isOutOfRange: false,
        statusMessage: `Interpolated: ${roundedVolume.toFixed(1)} ml between ${p1.volumeMl} ml and ${p2.volumeMl} ml`,
        lowerPoint: p1,
        upperPoint: p2,
      };
    }
  }

  // 5. FALLBACK FOR LOCAL NON-MONOTONIC POINTS WITHIN OVERALL CALIBRATION SPAN
  let nearestIdx = 0;
  let minDiff = Math.abs(raw - confirmedPoints[0].averageRaw);
  for (let i = 1; i < confirmedPoints.length; i++) {
    const diff = Math.abs(raw - confirmedPoints[i].averageRaw);
    if (diff < minDiff) {
      minDiff = diff;
      nearestIdx = i;
    }
  }

  const neighborIdx = nearestIdx === 0 ? 1 : nearestIdx === confirmedPoints.length - 1 ? nearestIdx - 1 : (
    Math.abs(raw - confirmedPoints[nearestIdx - 1].averageRaw) < Math.abs(raw - confirmedPoints[nearestIdx + 1].averageRaw)
      ? nearestIdx - 1
      : nearestIdx + 1
  );

  const pA = confirmedPoints[Math.min(nearestIdx, neighborIdx)];
  const pB = confirmedPoints[Math.max(nearestIdx, neighborIdx)];

  if (pA.averageRaw !== pB.averageRaw) {
    const ratio = (raw - pA.averageRaw) / (pB.averageRaw - pA.averageRaw);
    const volume = pA.volumeMl + ratio * (pB.volumeMl - pA.volumeMl);
    const roundedVolume = Math.max(0, Math.round(volume * 10) / 10);

    return {
      volumeMl: roundedVolume,
      isCalibrated: true,
      isOutOfRange: false,
      statusMessage: `Interpolated: ${roundedVolume.toFixed(1)} ml near ${pA.volumeMl} ml`,
      lowerPoint: pA,
      upperPoint: pB,
    };
  }

  return {
    volumeMl: null,
    isCalibrated: true,
    isOutOfRange: true,
    statusMessage: 'Ambiguous calibration interpolation segment',
  };
}

