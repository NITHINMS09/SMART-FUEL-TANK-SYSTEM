import { MotorDirection, MotorProfile, ProfileInterpolationResult } from '../types';

export const MAX_MOTOR_PROFILES = 30;

/**
 * Sorts motor profiles by volume ascending
 */
export function sortMotorProfiles(profiles: MotorProfile[]): MotorProfile[] {
  return [...profiles].sort((a, b) => a.volumeMl - b.volumeMl);
}

/**
 * Given a measured water volume in ml, determine the closed rotation angle and direction.
 * If volume falls between configured profile points, linearly interpolates the angle
 * and selects the direction from the nearest profile.
 */
export function interpolateClosedMotorAction(
  volumeMl: number,
  profiles: MotorProfile[]
): ProfileInterpolationResult | null {
  if (!profiles || profiles.length === 0) {
    return null;
  }

  const sorted = sortMotorProfiles(profiles);

  // Exact match
  const exact = sorted.find(p => Math.abs(p.volumeMl - volumeMl) < 0.01);
  if (exact) {
    return {
      degrees: exact.closeDegrees,
      direction: exact.closeDirection,
      interpolated: false,
      nearestVolume: exact.volumeMl,
      lowerProfile: exact,
      upperProfile: exact,
    };
  }

  // Below lowest profile
  if (volumeMl <= sorted[0].volumeMl) {
    const lowest = sorted[0];
    return {
      degrees: lowest.closeDegrees,
      direction: lowest.closeDirection,
      interpolated: false,
      nearestVolume: lowest.volumeMl,
      lowerProfile: lowest,
    };
  }

  // Above highest profile
  if (volumeMl >= sorted[sorted.length - 1].volumeMl) {
    const highest = sorted[sorted.length - 1];
    return {
      degrees: highest.closeDegrees,
      direction: highest.closeDirection,
      interpolated: false,
      nearestVolume: highest.volumeMl,
      upperProfile: highest,
    };
  }

  // Interpolate between two profiles
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];

    if (volumeMl >= p1.volumeMl && volumeMl <= p2.volumeMl) {
      const vSpan = p2.volumeMl - p1.volumeMl;
      const ratio = vSpan > 0 ? (volumeMl - p1.volumeMl) / vSpan : 0;
      
      const degrees = Math.round(p1.closeDegrees + ratio * (p2.closeDegrees - p1.closeDegrees));
      
      // Select direction according to nearest profile
      const nearest = ratio < 0.5 ? p1 : p2;

      return {
        degrees,
        direction: nearest.closeDirection,
        interpolated: true,
        nearestVolume: nearest.volumeMl,
        lowerProfile: p1,
        upperProfile: p2,
      };
    }
  }

  return null;
}

/**
 * Format ESP32 serial command to save motor profile:
 * PROFILE,<ml>,<openDegrees>,<openCW>,<closeDegrees>,<closeCW>
 * Where openCW and closeCW are 1 (CW) or 0 (CCW)
 */
export function formatProfileCommand(profile: MotorProfile): string {
  const openCW = profile.openDirection === 'CW' ? '1' : '0';
  const closeCW = profile.closeDirection === 'CW' ? '1' : '0';
  return `PROFILE,${Math.round(profile.volumeMl)},${Math.round(profile.openDegrees)},${openCW},${Math.round(profile.closeDegrees)},${closeCW}`;
}

/**
 * Format motor manual OPEN command
 */
export function formatOpenCommand(degrees: number, direction: MotorDirection): string {
  return `OPEN,${Math.round(degrees)},${direction}`;
}

/**
 * Format motor manual CLOSE command
 */
export function formatCloseCommand(degrees: number, direction: MotorDirection): string {
  return `CLOSE,${Math.round(degrees)},${direction}`;
}

