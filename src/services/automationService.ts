import {
  AutomationEvent,
  CalibrationPoint,
  MotorDirection,
  MotorProfile,
  OperatingMode,
  RawReading,
} from '../types';
import { calculateLoadCellStats, interpolateVolumeFromRaw } from './calibrationService';
import { interpolateClosedMotorAction } from './motorService';
import { serialService } from './serialService';

export interface AutoCloseProgress {
  stage: 'IDLE' | 'SENDING_CMD' | 'COLLECTING_READINGS' | 'CALCULATING_VOLUME' | 'SELECTING_PROFILE' | 'EXECUTING_MOTOR' | 'COMPLETED' | 'ERROR';
  measuredVolumeMl: number | null;
  targetDegrees: number | null;
  targetDirection: MotorDirection | null;
  errorMessage: string | null;
}

export class AutomationService {
  /**
   * Helper to execute automatic cap closed sequence:
   * 1. Send AUTO_CLOSE to ESP32.
   * 2. ESP32 starts sequence and streams readings or CAL/AUTO_VOLUME/AUTO_ROTATION.
   * 3. Collect 20 readings if needed or compute from current window.
   * 4. Convert raw reading into ml using saved calibration points.
   * 5. Identify relevant motor profile.
   * 6. Interpolate rotation angle.
   * 7. Select direction according to nearest configured profile.
   * 8. Execute motor rotation (or verify firmware AUTO_ROTATION).
   * 9. Return execution summary for UI and logging.
   */
  static async executeAutoClose(
    recentReadings: RawReading[],
    calibrationPoints: CalibrationPoint[],
    motorProfiles: MotorProfile[],
    onProgress?: (progress: AutoCloseProgress) => void
  ): Promise<AutomationEvent> {
    const notify = (stage: AutoCloseProgress['stage'], extra?: Partial<AutoCloseProgress>) => {
      onProgress?.({
        stage,
        measuredVolumeMl: extra?.measuredVolumeMl ?? null,
        targetDegrees: extra?.targetDegrees ?? null,
        targetDirection: extra?.targetDirection ?? null,
        errorMessage: extra?.errorMessage ?? null,
      });
    };

    try {
      notify('SENDING_CMD');
      await serialService.sendCommand('AUTO_CLOSE');

      notify('COLLECTING_READINGS');
      // If we already have recent live readings, use latest 20;
      // otherwise, pause 600ms to allow 20 samples from stream
      if (recentReadings.length < 20) {
        await new Promise((r) => setTimeout(r, 800));
      }

      notify('CALCULATING_VOLUME');
      const stats = calculateLoadCellStats(recentReadings, 100, 20);
      const avgRaw = stats.average;

      if (avgRaw === null) {
        throw new Error('Could not obtain valid sensor readings during automation.');
      }

      const interp = interpolateVolumeFromRaw(avgRaw, calibrationPoints);
      if (!interp.isCalibrated || interp.volumeMl === null) {
        throw new Error(interp.statusMessage || 'System not calibrated. Unable to calculate water volume.');
      }

      const volumeMl = interp.volumeMl;

      notify('SELECTING_PROFILE', { measuredVolumeMl: volumeMl });

      const profileResult = interpolateClosedMotorAction(volumeMl, motorProfiles);
      if (!profileResult) {
        throw new Error(`No matching motor profile found for calculated volume of ${volumeMl} ml. Please configure profiles in Motor Configuration.`);
      }

      notify('EXECUTING_MOTOR', {
        measuredVolumeMl: volumeMl,
        targetDegrees: profileResult.degrees,
        targetDirection: profileResult.direction,
      });

      // The firmware AUTO_CLOSE might execute the rotation, or if separate motor command is needed:
      // Send CLOSE command with calculated parameters
      await serialService.sendCommand(`CLOSE,${profileResult.degrees},${profileResult.direction}`);

      // Wait until motor finishes
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          sub();
          resolve(); // assume done after reasonable timeout if no response
        }, 12000);

        const sub = serialService.subscribe((ev) => {
          if (ev.type === 'MOTOR_COMPLETED') {
            clearTimeout(timeout);
            sub();
            resolve();
          } else if (ev.type === 'ERROR') {
            clearTimeout(timeout);
            sub();
            reject(new Error(ev.message));
          }
        });
      });

      notify('COMPLETED', {
        measuredVolumeMl: volumeMl,
        targetDegrees: profileResult.degrees,
        targetDirection: profileResult.direction,
      });

      const event: AutomationEvent = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'AUTO_CLOSE',
        mode: 'AUTOMATIC',
        volumeMl,
        degrees: profileResult.degrees,
        direction: profileResult.direction,
        status: 'SUCCESS',
        details: `Automatic cap close: ${volumeMl} ml measured -> rotated ${profileResult.degrees}° ${profileResult.direction}${profileResult.interpolated ? ' (interpolated)' : ''}`,
      };

      return event;
    } catch (err: any) {
      notify('ERROR', { errorMessage: err.message });
      const event: AutomationEvent = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'AUTO_CLOSE',
        mode: 'AUTOMATIC',
        volumeMl: null,
        degrees: null,
        direction: 'NONE',
        status: 'FAILED',
        details: `Automation failed: ${err.message}`,
      };
      return event;
    }
  }

  /**
   * Execute manual or configured CAP OPEN
   */
  static async executeCapOpen(
    degrees: number = 90,
    direction: MotorDirection = 'CW',
    mode: OperatingMode = 'MANUAL'
  ): Promise<AutomationEvent> {
    try {
      await serialService.sendCommand(`OPEN,${Math.round(degrees)},${direction}`);

      return {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'CAP_OPEN',
        mode,
        volumeMl: null,
        degrees,
        direction,
        status: 'SUCCESS',
        details: `Cap open executed: ${degrees}° ${direction}`,
      };
    } catch (err: any) {
      return {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'CAP_OPEN',
        mode,
        volumeMl: null,
        degrees,
        direction,
        status: 'FAILED',
        details: `Cap open failed: ${err.message}`,
      };
    }
  }

  /**
   * Execute manual CAP CLOSED
   */
  static async executeCapClose(
    degrees: number = 180,
    direction: MotorDirection = 'CCW',
    mode: OperatingMode = 'MANUAL'
  ): Promise<AutomationEvent> {
    try {
      await serialService.sendCommand(`CLOSE,${Math.round(degrees)},${direction}`);

      return {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'CAP_CLOSED',
        mode,
        volumeMl: null,
        degrees,
        direction,
        status: 'SUCCESS',
        details: `Cap closed executed: ${degrees}° ${direction}`,
      };
    } catch (err: any) {
      return {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'CAP_CLOSED',
        mode,
        volumeMl: null,
        degrees,
        direction,
        status: 'FAILED',
        details: `Cap close failed: ${err.message}`,
      };
    }
  }
}
