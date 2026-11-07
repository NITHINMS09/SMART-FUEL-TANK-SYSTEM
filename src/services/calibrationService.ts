import { CalibrationPoint, InterpolationResult, LoadCellStats, RawReading, StabilityStatus } from '../types';

export const MAX_CALIBRATION_POINTS = 30;

/**
 * Calculates sliding window statistics over a list of raw readings
 */
export function calculateLoadCellStats(
  readings: RawReading[],
  stabilityThreshold: number = 50,
  targetSampleCount: number = 20
): LoadCellStats {
  if (!readings || readings.length === 0) {
    return {
      currentRaw: null,
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

    return {
      currentRaw,
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

  return {
    currentRaw,
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
 * - Never extrapolates beyond calibrated values without clearly flagging out-of-range.
 */
export function interpolateVolumeFromRaw(
  raw: number | null,
  points: CalibrationPoint[]
): InterpolationResult {
  if (raw === null) {
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
      statusMessage: 'Insufficient calibration data (minimum 2 points required)',
    };
  }

  // Determine direction: are raw readings increasing or decreasing with volume?
  // Let's check first and last points:
  const first = confirmedPoints[0];
  const last = confirmedPoints[confirmedPoints.length - 1];
  const isDirect = last.averageRaw > first.averageRaw; // increasing with volume

  // Find overall min and max raw in the calibration points
  const allRaws = confirmedPoints.map(p => p.averageRaw);
  const minRaw = Math.min(...allRaws);
  const maxRaw = Math.max(...allRaws);

  // Check if raw reading is out of range
  if (raw < minRaw) {
    const edgePoint = isDirect ? first : last;
    return {
      volumeMl: edgePoint.volumeMl,
      isCalibrated: true,
      isOutOfRange: true,
      statusMessage: `OUT OF RANGE: Below minimum calibrated reading (${raw} < ${minRaw})`,
    };
  }

  if (raw > maxRaw) {
    const edgePoint = isDirect ? last : first;
    return {
      volumeMl: edgePoint.volumeMl,
      isCalibrated: true,
      isOutOfRange: true,
      statusMessage: `OUT OF RANGE: Above maximum calibrated reading (${raw} > ${maxRaw})`,
    };
  }

  // Exact match
  const exact = confirmedPoints.find(p => p.averageRaw === raw);
  if (exact) {
    return {
      volumeMl: exact.volumeMl,
      isCalibrated: true,
      isOutOfRange: false,
      statusMessage: `Calibrated match at ${exact.volumeMl} ml`,
      lowerPoint: exact,
      upperPoint: exact,
    };
  }

  // Find bounding segment
  for (let i = 0; i < confirmedPoints.length - 1; i++) {
    const p1 = confirmedPoints[i];
    const p2 = confirmedPoints[i + 1];

    const r1 = p1.averageRaw;
    const r2 = p2.averageRaw;

    const inSegment = (r1 <= raw && raw <= r2) || (r2 <= raw && raw <= r1);

    if (inSegment && r1 !== r2) {
      // Linear interpolation:
      // volume = v1 + (raw - r1) * (v2 - v1) / (r2 - r1)
      const ratio = (raw - r1) / (r2 - r1);
      const volume = p1.volumeMl + ratio * (p2.volumeMl - p1.volumeMl);
      const roundedVolume = Math.round(volume * 10) / 10;

      return {
        volumeMl: roundedVolume,
        isCalibrated: true,
        isOutOfRange: false,
        statusMessage: `Interpolated: ${roundedVolume} ml between ${p1.volumeMl}ml and ${p2.volumeMl}ml`,
        lowerPoint: p1,
        upperPoint: p2,
      };
    }
  }

  // Fallback to nearest if segment was degenerate
  return {
    volumeMl: null,
    isCalibrated: true,
    isOutOfRange: true,
    statusMessage: 'Ambiguous calibration interpolation segment',
  };
}
