// ==========================================
// SMART TANK CONTROL CENTER - TYPE DEFINITIONS
// ==========================================

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export type MotorStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR';

export type HX711Status = 'OK' | 'ERROR' | 'INITIALIZING' | 'OFFLINE';

export type StabilityStatus = 'STABLE' | 'UNSTABLE' | 'WAITING FOR READINGS';

export type OperatingMode = 'MANUAL' | 'AUTOMATIC';

export type AutomationStatus = 'IDLE' | 'MONITORING' | 'ADJUSTING' | 'STABLE' | 'UNSTABLE' | 'ERROR';

export type MotorDirection = 'CW' | 'CCW';

export interface RawReading {
  raw: number;
  timestamp: number;
}

export interface LoadCellStats {
  currentRaw: number | null;
  filteredRaw: number | null;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  range: number | null;
  stability: StabilityStatus;
  sampleCount: number;
  history: RawReading[];
}

export interface CalibrationPoint {
  id: string;
  volumeMl: number;
  averageRaw: number;
  minimum: number;
  maximum: number;
  range: number;
  status: 'CONFIRMED' | 'UNSAVED' | 'REJECTED';
  timestamp: number;
  syncedToESP: boolean;
}

export interface CalResultData {
  volumeMl: number;
  averageRaw: number;
  minimum: number;
  maximum: number;
  range: number;
  timestamp: number;
}

export interface CalibrationDebugLog {
  id: string;
  timestamp: number;
  type: 'TX' | 'RX' | 'STATUS' | 'ERROR' | 'TIMEOUT';
  message: string;
  payload?: any;
}

export interface MotorProfile {
  id: string;
  volumeMl: number;
  openDegrees: number;
  openDirection: MotorDirection;
  openSpeed?: number;
  openAcceleration?: number;
  closeDegrees: number;
  closeDirection: MotorDirection;
  closeSpeed?: number;
  closeAcceleration?: number;
  syncedToESP: boolean;
  timestamp: number;
}

export interface LastMotorOperation {
  type: 'OPEN' | 'CLOSE' | 'AUTO_CLOSE' | 'ADJUST' | 'MOVE_TO' | 'EMERGENCY_STOP';
  degrees: number;
  direction: MotorDirection | 'NONE';
  timestamp: number;
  success: boolean;
  message?: string;
}

export interface AutomationEvent {
  id: string;
  timestamp: number;
  type: 'AUTO_CLOSE' | 'AUTO_ADJUST' | 'CAP_OPEN' | 'CAP_CLOSED' | 'MEASURE_VOLUME' | 'EMERGENCY_STOP';
  mode: OperatingMode;
  volumeMl: number | null;
  degrees: number | null;
  direction: MotorDirection | 'NONE';
  status: 'SUCCESS' | 'FAILED' | 'ABORTED';
  details: string;
}

export interface AutomationFeedbackState {
  mode: OperatingMode;
  status: AutomationStatus;
  liveRaw: number | null;
  filteredRaw: number | null;
  calculatedVolumeMl: number | null;
  currentMotorPosition: number;
  targetMotorPosition: number;
  requiredAdjustment: number;
  motorDirection: MotorDirection | 'IDLE';
  lastAdjustmentTime: number | null;
  lastAdjustmentDetails: string | null;
  angleDeadband: number;
  volumeDeadband: number;
  minAdjustmentInterval: number;
  maxMotorAngle: number;
  minMotorAngle: number;
  isMotorMoving: boolean;
  stability: StabilityStatus;
  errorMessage: string | null;
  capControl?: AutomaticCapState;
}

export interface DeviceSettings {
  baudRate: number;
  stabilityThreshold: number;
  calibrationSampleCount: number;
  microstepping: string;
  stepsPerRevolution: number;
  maxMotorSpeed: number;
  motorAcceleration: number;
  hx711PinDt: number;
  hx711PinSck: number;
  drv8825PinStep: number;
  drv8825PinDir: number;
  drv8825PinEn: number;
}

export interface SerialMessageLog {
  id: string;
  timestamp: number;
  direction: 'TX' | 'RX';
  text: string;
  parsedType?: string;
}

export interface BackupData {
  version: string;
  exportedAt: string;
  authoritativeSource: 'ESP32_NVS' | 'BROWSER_BACKUP';
  calibrationPoints: CalibrationPoint[];
  motorProfiles: MotorProfile[];
  settings: DeviceSettings;
  automationHistory: AutomationEvent[];
}

export interface InterpolationResult {
  volumeMl: number | null;
  isCalibrated: boolean;
  isOutOfRange: boolean;
  statusMessage: string;
  lowerPoint?: CalibrationPoint;
  upperPoint?: CalibrationPoint;
}

export interface ProfileInterpolationResult {
  degrees: number;
  direction: MotorDirection;
  interpolated: boolean;
  nearestVolume: number;
  lowerProfile?: MotorProfile;
  upperProfile?: MotorProfile;
}

export type CapOperationStage =
  | 'IDLE'
  | 'CAPTURING_READING'
  | 'CALCULATING_VOLUME'
  | 'SELECTING_PROFILE'
  | 'EXECUTING_MOTOR'
  | 'COMPLETED'
  | 'ERROR';

export interface AutomaticCapState {
  lastAction: 'OPEN' | 'CLOSE' | null;
  stage: CapOperationStage;
  currentRaw: number | null;
  calculatedVolumeMl: number | null;
  selectedProfile: string | null;
  selectedDegrees: number | null;
  selectedDirection: MotorDirection | null;
  isInterpolated: boolean;
  motorStatus: 'IDLE' | 'MOVING' | 'COMPLETED' | 'ERROR';
  lastOperationTime: number | null;
  errorMessage: string | null;
}
