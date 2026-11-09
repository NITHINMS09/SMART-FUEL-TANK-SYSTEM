import { MotorDirection, MotorProfile, ProfileInterpolationResult } from '../types';

export const MAX_MOTOR_PROFILES = 30;

/**
 * Sorts motor profiles by volume ascending
 */
export function sortMotorProfiles(profiles: MotorProfile[]): MotorProfile[] {
  return [...profiles].sort((a, b) => a.volumeMl - b.volumeMl);
}

export interface ProfileActionSelection {
  action: 'OPEN' | 'CLOSE';
  degrees: number;
  direction: MotorDirection;
  interpolated: boolean;
  matchedVolumeMl: number;
  profileDescription: string;
  lowerProfile?: MotorProfile;
  upperProfile?: MotorProfile;
}

/**
 * Given a target action ('OPEN' or 'CLOSE') and measured volume in ml,
 * identifies the corresponding configured motor rotation angle and direction.
 * Linearly interpolates between configured volume points when volume falls between profiles.
 * Preserves exact configured rotation angles and directions.
 */
export function interpolateMotorAction(
  action: 'OPEN' | 'CLOSE',
  volumeMl: number,
  profiles: MotorProfile[]
): ProfileActionSelection | null {
  if (!profiles || profiles.length === 0) {
    return null;
  }

  const sorted = sortMotorProfiles(profiles);

  // Exact profile match
  const exact = sorted.find((p) => Math.abs(p.volumeMl - volumeMl) < 0.01);
  if (exact) {
    const degrees = action === 'OPEN' ? exact.openDegrees : exact.closeDegrees;
    const direction = action === 'OPEN' ? exact.openDirection : exact.closeDirection;
    return {
      action,
      degrees,
      direction,
      interpolated: false,
      matchedVolumeMl: exact.volumeMl,
      profileDescription: `Exact ${exact.volumeMl} ml Profile`,
      lowerProfile: exact,
      upperProfile: exact,
    };
  }

  // Volume below lowest profile point: clamp to lowest configured profile
  if (volumeMl <= sorted[0].volumeMl) {
    const lowest = sorted[0];
    const degrees = action === 'OPEN' ? lowest.openDegrees : lowest.closeDegrees;
    const direction = action === 'OPEN' ? lowest.openDirection : lowest.closeDirection;
    return {
      action,
      degrees,
      direction,
      interpolated: false,
      matchedVolumeMl: lowest.volumeMl,
      profileDescription: `Baseline Profile (${lowest.volumeMl} ml)`,
      lowerProfile: lowest,
    };
  }

  // Volume above highest profile point: clamp to highest configured profile
  if (volumeMl >= sorted[sorted.length - 1].volumeMl) {
    const highest = sorted[sorted.length - 1];
    const degrees = action === 'OPEN' ? highest.openDegrees : highest.closeDegrees;
    const direction = action === 'OPEN' ? highest.openDirection : highest.closeDirection;
    return {
      action,
      degrees,
      direction,
      interpolated: false,
      matchedVolumeMl: highest.volumeMl,
      profileDescription: `Max Profile (${highest.volumeMl} ml)`,
      upperProfile: highest,
    };
  }

  // Interpolate between two configured profiles
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];

    if (volumeMl >= p1.volumeMl && volumeMl <= p2.volumeMl) {
      const vSpan = p2.volumeMl - p1.volumeMl;
      const ratio = vSpan > 0 ? (volumeMl - p1.volumeMl) / vSpan : 0;

      const deg1 = action === 'OPEN' ? p1.openDegrees : p1.closeDegrees;
      const deg2 = action === 'OPEN' ? p2.openDegrees : p2.closeDegrees;
      const dir1 = action === 'OPEN' ? p1.openDirection : p1.closeDirection;
      const dir2 = action === 'OPEN' ? p2.openDirection : p2.closeDirection;

      const degrees = Math.round(deg1 + ratio * (deg2 - deg1));
      const direction = ratio < 0.5 ? dir1 : dir2;
      const nearest = ratio < 0.5 ? p1 : p2;

      return {
        action,
        degrees,
        direction,
        interpolated: true,
        matchedVolumeMl: nearest.volumeMl,
        profileDescription: `Interpolated: ${p1.volumeMl} ml (${deg1}°) – ${p2.volumeMl} ml (${deg2}°)`,
        lowerProfile: p1,
        upperProfile: p2,
      };
    }
  }

  return null;
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
  const result = interpolateMotorAction('CLOSE', volumeMl, profiles);
  if (!result) return null;
  return {
    degrees: result.degrees,
    direction: result.direction,
    interpolated: result.interpolated,
    nearestVolume: result.matchedVolumeMl,
    lowerProfile: result.lowerProfile,
    upperProfile: result.upperProfile,
  };
}

/**
 * Calculates clamped target motor angle in degrees for continuous automatic adjustment
 */
export function calculateTargetMotorAngle(
  volumeMl: number,
  profiles: MotorProfile[],
  minAngle: number = 0,
  maxAngle: number = 360
): { targetAngle: number; interpolated: boolean; nearestVolume: number } | null {
  const result = interpolateClosedMotorAction(volumeMl, profiles);
  if (!result) return null;
  const clampedAngle = Math.max(minAngle, Math.min(maxAngle, result.degrees));
  return {
    targetAngle: clampedAngle,
    interpolated: result.interpolated,
    nearestVolume: result.nearestVolume,
  };
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

