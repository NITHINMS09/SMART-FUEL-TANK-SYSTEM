import { BackupData, CalibrationPoint, DeviceSettings, MotorProfile, AutomationEvent } from '../types';

const STORAGE_KEYS = {
  CALIBRATION_POINTS: 'smart_tank_calibration_points',
  MOTOR_PROFILES: 'smart_tank_motor_profiles',
  SETTINGS: 'smart_tank_settings',
  AUTOMATION_HISTORY: 'smart_tank_automation_history',
  LAST_BACKUP: 'smart_tank_last_backup_timestamp',
  MOTOR_POSITION: 'smart_tank_motor_position',
  AUTOMATION_CONFIG: 'smart_tank_automation_config',
};

export const DEFAULT_SETTINGS: DeviceSettings = {
  baudRate: 115200,
  stabilityThreshold: 50,
  calibrationSampleCount: 20,
  microstepping: '1/16',
  stepsPerRevolution: 200,
  maxMotorSpeed: 1000,
  motorAcceleration: 500,
  hx711PinDt: 16,
  hx711PinSck: 17,
  drv8825PinStep: 4,
  drv8825PinDir: 5,
  drv8825PinEn: 6,
};

export class StorageService {
  /**
   * Load stored calibration points (browser cache)
   */
  static loadCalibrationPoints(): CalibrationPoint[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CALIBRATION_POINTS);
      if (!data) return [];
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load calibration points from storage:', e);
      return [];
    }
  }

  /**
   * Save calibration points to browser cache
   */
  static saveCalibrationPoints(points: CalibrationPoint[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CALIBRATION_POINTS, JSON.stringify(points));
    } catch (e) {
      console.error('Failed to save calibration points to storage:', e);
    }
  }

  /**
   * Load stored motor profiles (browser cache)
   */
  static loadMotorProfiles(): MotorProfile[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MOTOR_PROFILES);
      if (!data) return [];
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load motor profiles from storage:', e);
      return [];
    }
  }

  /**
   * Save motor profiles to browser cache
   */
  static saveMotorProfiles(profiles: MotorProfile[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.MOTOR_PROFILES, JSON.stringify(profiles));
    } catch (e) {
      console.error('Failed to save motor profiles to storage:', e);
    }
  }

  /**
   * Load device settings
   */
  static loadSettings(): DeviceSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch (e) {
      console.error('Failed to load settings:', e);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Save device settings
   */
  static saveSettings(settings: DeviceSettings): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  /**
   * Load automation history
   */
  static loadAutomationHistory(): AutomationEvent[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUTOMATION_HISTORY);
      if (!data) return [];
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load automation history:', e);
      return [];
    }
  }

  /**
   * Save automation history
   */
  static saveAutomationHistory(history: AutomationEvent[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTOMATION_HISTORY, JSON.stringify(history.slice(-100))); // keep latest 100
    } catch (e) {
      console.error('Failed to save automation history:', e);
    }
  }

  /**
   * Load cap state (OPEN or CLOSED)
   */
  static loadCapState(): 'OPEN' | 'CLOSED' {
    try {
      const data = localStorage.getItem('smart_tank_cap_state');
      return data === 'CLOSED' ? 'CLOSED' : 'OPEN';
    } catch {
      return 'OPEN';
    }
  }

  /**
   * Save cap state (OPEN or CLOSED)
   */
  static saveCapState(state: 'OPEN' | 'CLOSED'): void {
    try {
      localStorage.setItem('smart_tank_cap_state', state);
    } catch (e) {
      console.error('Failed to save cap state:', e);
    }
  }

  /**
   * Load current motor commanded position (in degrees)
   */
  static loadMotorPosition(): number {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MOTOR_POSITION);
      if (data === null) return 0;
      const parsed = parseFloat(data);
      return isNaN(parsed) ? 0 : parsed;
    } catch {
      return 0;
    }
  }

  /**
   * Save current motor commanded position (in degrees)
   */
  static saveMotorPosition(degrees: number): void {
    try {
      localStorage.setItem(STORAGE_KEYS.MOTOR_POSITION, degrees.toString());
    } catch (e) {
      console.error('Failed to save motor position:', e);
    }
  }

  /**
   * Load automation loop configuration
   */
  static loadAutomationConfig(): {
    angleDeadband: number;
    volumeDeadband: number;
    minAdjustmentInterval: number;
    maxMotorAngle: number;
    minMotorAngle: number;
  } {
    const defaults = {
      angleDeadband: 2.0,
      volumeDeadband: 5.0,
      minAdjustmentInterval: 1500,
      maxMotorAngle: 360,
      minMotorAngle: 0,
    };
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUTOMATION_CONFIG);
      if (!data) return defaults;
      return { ...defaults, ...JSON.parse(data) };
    } catch {
      return defaults;
    }
  }

  /**
   * Save automation loop configuration
   */
  static saveAutomationConfig(config: {
    angleDeadband: number;
    volumeDeadband: number;
    minAdjustmentInterval: number;
    maxMotorAngle: number;
    minMotorAngle: number;
  }): void {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTOMATION_CONFIG, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save automation config:', e);
    }
  }

  /**
   * Get last backup timestamp
   */
  static getLastBackupDate(): string | null {
    return localStorage.getItem(STORAGE_KEYS.LAST_BACKUP);
  }

  /**
   * Record backup date
   */
  static setLastBackupDate(dateStr: string): void {
    localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, dateStr);
  }

  /**
   * Export all configuration to JSON string
   */
  static exportFullBackup(
    calibrationPoints: CalibrationPoint[],
    motorProfiles: MotorProfile[],
    settings: DeviceSettings,
    history: AutomationEvent[]
  ): string {
    const backup: BackupData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      authoritativeSource: 'ESP32_NVS',
      calibrationPoints,
      motorProfiles,
      settings,
      automationHistory: history,
    };
    const json = JSON.stringify(backup, null, 2);
    this.setLastBackupDate(backup.exportedAt);
    return json;
  }

  /**
   * Trigger browser file download of JSON data
   */
  static downloadJsonFile(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Validate and parse imported JSON backup
   */
  static parseImportData(jsonString: string): {
    valid: boolean;
    data?: Partial<BackupData>;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') {
        return { valid: false, error: 'Invalid JSON structure: expected an object' };
      }

      // Check if it's full backup or partial
      const calibrationPoints = Array.isArray(parsed.calibrationPoints) ? parsed.calibrationPoints : [];
      const motorProfiles = Array.isArray(parsed.motorProfiles) ? parsed.motorProfiles : [];
      const settings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : undefined;
      const automationHistory = Array.isArray(parsed.automationHistory) ? parsed.automationHistory : [];

      return {
        valid: true,
        data: {
          version: parsed.version || '1.0.0',
          exportedAt: parsed.exportedAt || new Date().toISOString(),
          calibrationPoints,
          motorProfiles,
          settings,
          automationHistory,
        },
      };
    } catch (e: any) {
      return { valid: false, error: e.message || 'Syntax error in JSON file' };
    }
  }
}

