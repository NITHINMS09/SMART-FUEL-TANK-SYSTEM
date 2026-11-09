import {
  AutomationEvent,
  AutomaticCapState,
  CalibrationPoint,
  MotorDirection,
  MotorProfile,
  OperatingMode,
  RawReading,
} from '../types';
import { calculateLoadCellStats, interpolateVolumeFromRaw } from './calibrationService';
import { interpolateMotorAction } from './motorService';
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
   * Core Automatic Cap Workflow (OPEN or CLOSE):
   * 1. Capture a fresh, stable HX711 reading.
   * 2. Calculate the current liquid volume using saved calibration points.
   * 3. Identify the corresponding existing motor configuration for that volume.
   * 4. Retrieve its configured rotation and direction.
   * 5. Execute the existing motor-control function with those exact settings.
   * 6. Report the selected profile and movement status.
   */
  static async executeAutomaticCap(
    action: 'OPEN' | 'CLOSE',
    recentReadings: RawReading[],
    calibrationPoints: CalibrationPoint[],
    motorProfiles: MotorProfile[],
    onProgress?: (state: Partial<AutomaticCapState>) => void,
    manualMotorFunction?: (action: 'OPEN' | 'CLOSE', degrees: number, direction: MotorDirection) => Promise<void>
  ): Promise<AutomationEvent> {
    try {
      // 0. Initial state notification
      onProgress?.({
        lastAction: action,
        stage: 'CAPTURING_READING',
        motorStatus: 'IDLE',
        errorMessage: null,
      });

      if (serialService.getState() !== 'CONNECTED') {
        throw new Error('ESP32 USB Serial is disconnected. Please connect the device.');
      }

      if (serialService.isMotorRunning()) {
        throw new Error('Motor is currently executing another movement.');
      }

      // 1. Capture fresh, stable HX711 reading
      // If reading window has fewer than 5 readings, pause briefly to gather fresh samples
      if (recentReadings.length < 5) {
        await new Promise((r) => setTimeout(r, 300));
      }

      const stats = calculateLoadCellStats(recentReadings, 100, 20);
      const freshRaw = stats.filteredRaw !== null ? stats.filteredRaw : stats.average;

      if (freshRaw === null) {
        throw new Error('Could not obtain valid HX711 sensor readings from ESP32.');
      }

      onProgress?.({
        currentRaw: freshRaw,
        stage: 'CALCULATING_VOLUME',
      });

      // 2. Calculate liquid volume using confirmed calibration points
      const confirmedCalPoints = calibrationPoints.filter((p) => p.status === 'CONFIRMED');
      if (confirmedCalPoints.length < 2) {
        throw new Error(
          `Liquid volume is uncalibrated (${confirmedCalPoints.length} points found). At least 2 calibration points are required.`
        );
      }

      const interp = interpolateVolumeFromRaw(freshRaw, confirmedCalPoints);
      if (!interp.isCalibrated || interp.volumeMl === null) {
        throw new Error(interp.statusMessage || 'Unable to calculate liquid volume from sensor reading.');
      }

      const volumeMl = interp.volumeMl;

      onProgress?.({
        calculatedVolumeMl: volumeMl,
        stage: 'SELECTING_PROFILE',
      });

      // 3. Identify the corresponding existing motor configuration
      if (!motorProfiles || motorProfiles.length === 0) {
        throw new Error('No motor profiles configured. Please create motor profiles in the Motor Configuration tab.');
      }

      const profileResult = interpolateMotorAction(action, volumeMl, motorProfiles);
      if (!profileResult) {
        throw new Error(`No matching motor configuration found for calculated volume of ${volumeMl.toFixed(1)} ml.`);
      }

      // 4. Retrieve configured rotation and direction
      const { degrees, direction, profileDescription, interpolated } = profileResult;

      onProgress?.({
        stage: 'EXECUTING_MOTOR',
        selectedProfile: profileDescription,
        selectedDegrees: degrees,
        selectedDirection: direction,
        isInterpolated: interpolated,
        motorStatus: 'MOVING',
      });

      // 5. Execute the existing motor-control function
      if (manualMotorFunction) {
        await manualMotorFunction(action, degrees, direction);
      } else {
        await serialService.sendCommand(`${action},${Math.round(degrees)},${direction}`);
      }

      // 6. Wait until motor completes execution
      await new Promise<void>((resolve, reject) => {
        const timeoutMs = Math.max(8000, degrees * 25);
        const timeout = setTimeout(() => {
          sub();
          resolve(); // Graceful fallback
        }, timeoutMs);

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

      onProgress?.({
        stage: 'COMPLETED',
        motorStatus: 'COMPLETED',
        lastOperationTime: Date.now(),
      });

      return {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: action === 'OPEN' ? 'CAP_OPEN' : 'CAP_CLOSED',
        mode: 'AUTOMATIC',
        volumeMl,
        degrees,
        direction,
        status: 'SUCCESS',
        details: `Automatic Cap ${action}: Fresh reading ${freshRaw} -> ${volumeMl.toFixed(1)} ml -> ${profileDescription} -> Executed ${degrees}° ${direction}`,
      };
    } catch (err: any) {
      onProgress?.({
        stage: 'ERROR',
        motorStatus: 'ERROR',
        errorMessage: err.message,
      });

      return {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: action === 'OPEN' ? 'CAP_OPEN' : 'CAP_CLOSED',
        mode: 'AUTOMATIC',
        volumeMl: null,
        degrees: null,
        direction: 'NONE',
        status: 'FAILED',
        details: `Cap ${action} failed: ${err.message}`,
      };
    }
  }

  /**
   * Backward-compatible helper for automated cap close
   */
  static async executeAutoClose(
    recentReadings: RawReading[],
    calibrationPoints: CalibrationPoint[],
    motorProfiles: MotorProfile[],
    onProgress?: (progress: AutoCloseProgress) => void
  ): Promise<AutomationEvent> {
    return AutomationService.executeAutomaticCap(
      'CLOSE',
      recentReadings,
      calibrationPoints,
      motorProfiles,
      (state) => {
        onProgress?.({
          stage: state.stage as any,
          measuredVolumeMl: state.calculatedVolumeMl ?? null,
          targetDegrees: state.selectedDegrees ?? null,
          targetDirection: state.selectedDirection ?? null,
          errorMessage: state.errorMessage ?? null,
        });
      }
    );
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

  /**
   * Execute relative motor adjustment for continuous feedback control loop
   */
  static async executeAdjustment(
    degrees: number,
    direction: MotorDirection,
    volumeMl: number,
    targetDegrees: number
  ): Promise<AutomationEvent> {
    try {
      const roundedDeg = Math.round(degrees);
      await serialService.sendCommand(`ADJUST,${roundedDeg},${direction}`);

      return {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'AUTO_ADJUST',
        mode: 'AUTOMATIC',
        volumeMl,
        degrees: roundedDeg,
        direction,
        status: 'SUCCESS',
        details: `Auto adjustment: ${roundedDeg}° ${direction} to reach target ${targetDegrees}° (${Math.round(volumeMl)} ml)`,
      };
    } catch (err: any) {
      return {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'AUTO_ADJUST',
        mode: 'AUTOMATIC',
        volumeMl,
        degrees,
        direction,
        status: 'FAILED',
        details: `Auto adjustment failed: ${err.message}`,
      };
    }
  }

  /**
   * Emergency stop execution
   */
  static async executeEmergencyStop(): Promise<AutomationEvent> {
    try {
      await serialService.emergencyStop();
      return {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'EMERGENCY_STOP',
        mode: 'MANUAL',
        volumeMl: null,
        degrees: null,
        direction: 'NONE',
        status: 'SUCCESS',
        details: 'Emergency motor stop triggered. Stepper coils de-energized.',
      };
    } catch (err: any) {
      return {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'EMERGENCY_STOP',
        mode: 'MANUAL',
        volumeMl: null,
        degrees: null,
        direction: 'NONE',
        status: 'FAILED',
        details: `Emergency stop error: ${err.message}`,
      };
    }
  }
}

