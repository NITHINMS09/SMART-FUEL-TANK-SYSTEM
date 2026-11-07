/**
 * ============================================================================
 * SMART TANK CONTROL CENTER - ESP32-S3 FIRMWARE REFERENCE
 * ============================================================================
 * 
 * Target: ESP32-S3 DevKit / Board
 * Communication: USB Serial (CDC) at 115200 Baud
 * 
 * Pin Definitions (Hardware Fixed):
 * - HX711 DT (Data):       GPIO 16
 * - HX711 SCK (Clock):     GPIO 17
 * - DRV8825 STEP:          GPIO 4
 * - DRV8825 DIR:           GPIO 5
 * - DRV8825 EN:            GPIO 6
 * 
 * Non-Volatile Storage (NVS):
 * Uses ESP32 Preferences library to persist:
 * - Up to 30 Calibration Points
 * - Up to 30 Motor Profiles
 * ============================================================================
 */

#include <Arduino.h>
#include <Preferences.h>

// --- PIN ASSIGNMENTS ---
#define PIN_HX711_DT    16
#define PIN_HX711_SCK   17
#define PIN_DRV_STEP    4
#define PIN_DRV_DIR     5
#define PIN_DRV_EN      6

// --- LIMITS ---
#define MAX_CALIBRATION_POINTS 30
#define MAX_MOTOR_PROFILES     30
#define STABILITY_THRESHOLD    50  // Maximum raw range across 20 samples to accept calibration

// --- STRUCTS ---
struct CalibrationPoint {
  float volumeMl;
  long averageRaw;
  long minRaw;
  long maxRaw;
  long rangeRaw;
};

struct MotorProfile {
  float volumeMl;
  int openDegrees;
  int openCW;       // 1 = CW, 0 = CCW
  int closeDegrees;
  int closeCW;      // 1 = CW, 0 = CCW
};

// --- GLOBAL STATE ---
Preferences preferences;

CalibrationPoint calPoints[MAX_CALIBRATION_POINTS];
int calPointCount = 0;

MotorProfile motorProfiles[MAX_MOTOR_PROFILES];
int motorProfileCount = 0;

volatile bool isMotorRunning = false;
volatile bool emergencyStopFlag = false;

// Sliding raw readings window
const int SAMPLE_WINDOW = 20;
long rawSamples[SAMPLE_WINDOW];
int sampleIndex = 0;
bool bufferFilled = false;

// Non-blocking timers
unsigned long lastRawStreamTime = 0;
const unsigned long RAW_STREAM_INTERVAL_MS = 50; // Stream raw reading every 50ms (20Hz)

// String input buffer
String inputBuffer = "";

// Forward declarations
long readHX711Raw();
void processCommand(const String& cmd);
void saveCalibrationToNVS();
void loadCalibrationFromNVS();
void saveProfilesToNVS();
void loadProfilesFromNVS();
void stepMotor(int degrees, bool isCW, int speedDelayMicros = 500);
float calculateEstimatedVolume(long raw);
int findProfileCloseAngle(float volumeMl, int& outDirection);

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  
  // Initialize HX711 Pins
  pinMode(PIN_HX711_DT, INPUT);
  pinMode(PIN_HX711_SCK, OUTPUT);
  digitalWrite(PIN_HX711_SCK, LOW);

  // Initialize DRV8825 Pins
  pinMode(PIN_DRV_STEP, OUTPUT);
  pinMode(PIN_DRV_DIR, OUTPUT);
  pinMode(PIN_DRV_EN, OUTPUT);
  digitalWrite(PIN_DRV_STEP, LOW);
  digitalWrite(PIN_DRV_DIR, LOW);
  digitalWrite(PIN_DRV_EN, HIGH); // Driver initially disabled (active LOW)

  // Load permanent configurations from NVS
  preferences.begin("smart_tank", false);
  loadCalibrationFromNVS();
  loadProfilesFromNVS();

  delay(200);
  Serial.println("SYSTEM_READY");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  // 1. Process incoming Serial commands
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      inputBuffer.trim();
      if (inputBuffer.length() > 0) {
        processCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      inputBuffer += c;
    }
  }

  // 2. Continuous raw reading acquisition and streaming
  unsigned long now = millis();
  if (now - lastRawStreamTime >= RAW_STREAM_INTERVAL_MS) {
    lastRawStreamTime = now;

    if (digitalRead(PIN_HX711_DT) == LOW) { // HX711 is ready
      long rawVal = readHX711Raw();
      
      // Update sliding buffer
      rawSamples[sampleIndex] = rawVal;
      sampleIndex = (sampleIndex + 1) % SAMPLE_WINDOW;
      if (sampleIndex == 0) bufferFilled = true;

      // Stream RAW value to web dashboard
      Serial.print("RAW,");
      Serial.println(rawVal);
    }
  }
}

// ============================================================================
// HX711 24-BIT BIT-BANG READ
// ============================================================================
long readHX711Raw() {
  unsigned long count = 0;
  
  // Pulse SCK 24 times to read 24 bits
  for (int i = 0; i < 24; i++) {
    digitalWrite(PIN_HX711_SCK, HIGH);
    delayMicroseconds(1);
    count = count << 1;
    digitalWrite(PIN_HX711_SCK, LOW);
    delayMicroseconds(1);
    if (digitalRead(PIN_HX711_DT)) {
      count++;
    }
  }

  // 25th pulse: Channel A, Gain 128
  digitalWrite(PIN_HX711_SCK, HIGH);
  delayMicroseconds(1);
  digitalWrite(PIN_HX711_SCK, LOW);
  delayMicroseconds(1);

  // Two's complement sign extension for 24-bit
  if (count & 0x800000) {
    count |= 0xFF000000;
  }

  return (long)count;
}

// ============================================================================
// STEPPER MOTOR DRIVER ACTUATION
// ============================================================================
void stepMotor(int degrees, bool isCW, int speedDelayMicros) {
  if (degrees <= 0) return;

  isMotorRunning = true;
  emergencyStopFlag = false;
  Serial.println("MOTOR_STARTED");

  // Enable DRV8825 driver (active LOW on EN pin)
  digitalWrite(PIN_DRV_EN, LOW);
  digitalWrite(PIN_DRV_DIR, isCW ? HIGH : LOW);
  delayMicroseconds(20);

  // Compute total steps for 1.8 degree stepper (200 steps/rev) with 1/16 microstepping = 3200 steps/rev
  // steps = degrees * (3200 / 360) = degrees * 8.88888
  long totalSteps = (long)(degrees * (3200.0 / 360.0));

  for (long i = 0; i < totalSteps; i++) {
    if (emergencyStopFlag) {
      Serial.println("ERROR,Motor execution halted by Emergency Stop");
      break;
    }
    digitalWrite(PIN_DRV_STEP, HIGH);
    delayMicroseconds(speedDelayMicros);
    digitalWrite(PIN_DRV_STEP, LOW);
    delayMicroseconds(speedDelayMicros);
    yield(); // Prevent watchdog trigger
  }

  // Disable driver coils to prevent overheating
  digitalWrite(PIN_DRV_EN, HIGH);
  isMotorRunning = false;
  Serial.println("MOTOR_COMPLETED");
}

// ============================================================================
// PROTOCOL COMMAND PARSER
// ============================================================================
void processCommand(const String& cmd) {
  if (cmd == "STOP") {
    emergencyStopFlag = true;
    digitalWrite(PIN_DRV_EN, HIGH); // Disable motor coils immediately
    isMotorRunning = false;
    Serial.println("MOTOR_COMPLETED");
    return;
  }

  if (cmd.startsWith("CAL,")) {
    // Format: CAL,<ml>
    float ml = cmd.substring(4).toFloat();
    
    // Compute sliding window statistics over latest 20 readings
    long minVal = rawSamples[0];
    long maxVal = rawSamples[0];
    long sum = 0;
    int count = bufferFilled ? SAMPLE_WINDOW : sampleIndex;
    if (count == 0) count = 1;

    for (int i = 0; i < count; i++) {
      long val = rawSamples[i];
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
      sum += val;
    }

    long avgVal = sum / count;
    long rangeVal = maxVal - minVal;

    Serial.print("CAL_RESULT,");
    Serial.print(ml);
    Serial.print(",");
    Serial.print(avgVal);
    Serial.print(",");
    Serial.print(minVal);
    Serial.print(",");
    Serial.print(maxVal);
    Serial.print(",");
    Serial.println(rangeVal);

    if (rangeVal > STABILITY_THRESHOLD) {
      Serial.println("CAL_REJECTED,UNSTABLE");
      return;
    }

    // Check if updating existing point for this volume or adding a new one
    int targetIdx = calPointCount;
    for (int i = 0; i < calPointCount; i++) {
      if (abs(calPoints[i].volumeMl - ml) < 0.1) {
        targetIdx = i;
        break;
      }
    }

    if (targetIdx < MAX_CALIBRATION_POINTS) {
      calPoints[targetIdx].volumeMl = ml;
      calPoints[targetIdx].averageRaw = avgVal;
      calPoints[targetIdx].minRaw = minVal;
      calPoints[targetIdx].maxRaw = maxVal;
      calPoints[targetIdx].rangeRaw = rangeVal;
      if (targetIdx == calPointCount) {
        calPointCount++;
      }
    } else {
      calPoints[MAX_CALIBRATION_POINTS - 1].volumeMl = ml;
      calPoints[MAX_CALIBRATION_POINTS - 1].averageRaw = avgVal;
      calPoints[MAX_CALIBRATION_POINTS - 1].minRaw = minVal;
      calPoints[MAX_CALIBRATION_POINTS - 1].maxRaw = maxVal;
      calPoints[MAX_CALIBRATION_POINTS - 1].rangeRaw = rangeVal;
    }

    saveCalibrationToNVS();
    Serial.println("CAL_ACCEPTED");
    Serial.println("CALIBRATION_SAVED");
    Serial.print("CALIBRATION_COUNT,");
    Serial.println(calPointCount);
    return;
  }

  if (cmd.startsWith("PROFILE,")) {
    // Format: PROFILE,<ml>,<openDegrees>,<openCW>,<closeDegrees>,<closeCW>
    int idx1 = cmd.indexOf(',');
    int idx2 = cmd.indexOf(',', idx1 + 1);
    int idx3 = cmd.indexOf(',', idx2 + 1);
    int idx4 = cmd.indexOf(',', idx3 + 1);
    int idx5 = cmd.indexOf(',', idx4 + 1);

    if (idx1 != -1 && idx2 != -1 && idx3 != -1 && idx4 != -1 && idx5 != -1) {
      float ml = cmd.substring(idx1 + 1, idx2).toFloat();
      int oDeg = cmd.substring(idx2 + 1, idx3).toInt();
      int oCW  = cmd.substring(idx3 + 1, idx4).toInt();
      int cDeg = cmd.substring(idx4 + 1, idx5).toInt();
      int cCW  = cmd.substring(idx5 + 1).toInt();

      // Check if updating existing
      int targetIdx = motorProfileCount;
      for (int i = 0; i < motorProfileCount; i++) {
        if (abs(motorProfiles[i].volumeMl - ml) < 0.1) {
          targetIdx = i;
          break;
        }
      }

      if (targetIdx < MAX_MOTOR_PROFILES) {
        motorProfiles[targetIdx].volumeMl = ml;
        motorProfiles[targetIdx].openDegrees = oDeg;
        motorProfiles[targetIdx].openCW = oCW;
        motorProfiles[targetIdx].closeDegrees = cDeg;
        motorProfiles[targetIdx].closeCW = cCW;
        if (targetIdx == motorProfileCount) {
          motorProfileCount++;
        }
        saveProfilesToNVS();
        Serial.println("PROFILE_SAVED");
      }
    } else {
      Serial.println("ERROR,Invalid PROFILE parameters");
    }
    return;
  }

  if (cmd.startsWith("OPEN,")) {
    // Format: OPEN,<degrees>,<CW or CCW>
    int idx = cmd.indexOf(',', 5);
    int deg = cmd.substring(5, idx).toInt();
    String dirStr = cmd.substring(idx + 1);
    dirStr.trim();
    bool isCW = (dirStr == "CW" || dirStr == "1");

    stepMotor(deg, isCW);
    return;
  }

  if (cmd.startsWith("CLOSE,")) {
    // Format: CLOSE,<degrees>,<CW or CCW>
    int idx = cmd.indexOf(',', 6);
    int deg = cmd.substring(6, idx).toInt();
    String dirStr = cmd.substring(idx + 1);
    dirStr.trim();
    bool isCW = (dirStr == "CW" || dirStr == "1");

    stepMotor(deg, isCW);
    return;
  }

  if (cmd == "AUTO_CLOSE") {
    // 1. Compute average raw reading
    long sum = 0;
    int count = bufferFilled ? SAMPLE_WINDOW : sampleIndex;
    if (count == 0) count = 1;
    for (int i = 0; i < count; i++) {
      sum += rawSamples[i];
    }
    long avgRaw = sum / count;

    // 2. Convert to volume
    float volumeMl = calculateEstimatedVolume(avgRaw);
    Serial.print("AUTO_VOLUME,");
    Serial.println(volumeMl);

    // 3. Find profile and rotation angle
    int dir = 1; // default CW
    int targetAngle = findProfileCloseAngle(volumeMl, dir);
    Serial.print("AUTO_ROTATION,");
    Serial.println(targetAngle);

    // 4. Actuate motor
    stepMotor(targetAngle, dir == 1);
    return;
  }

  if (cmd == "READ_VOLUME") {
    long sum = 0;
    int count = bufferFilled ? SAMPLE_WINDOW : sampleIndex;
    if (count == 0) count = 1;
    for (int i = 0; i < count; i++) {
      sum += rawSamples[i];
    }
    float vol = calculateEstimatedVolume(sum / count);
    Serial.print("CURRENT_VOLUME,");
    Serial.println(vol);
    return;
  }

  if (cmd == "GET_DATA") {
    // Report calibration points
    for (int i = 0; i < calPointCount; i++) {
      Serial.print("CAL_POINT,");
      Serial.print(calPoints[i].volumeMl);
      Serial.print(",");
      Serial.print(calPoints[i].averageRaw);
      Serial.print(",");
      Serial.print(calPoints[i].minRaw);
      Serial.print(",");
      Serial.print(calPoints[i].maxRaw);
      Serial.print(",");
      Serial.println(calPoints[i].rangeRaw);
    }
    // Report motor profiles
    for (int i = 0; i < motorProfileCount; i++) {
      Serial.print("PROFILE_POINT,");
      Serial.print(motorProfiles[i].volumeMl);
      Serial.print(",");
      Serial.print(motorProfiles[i].openDegrees);
      Serial.print(",");
      Serial.print(motorProfiles[i].openCW);
      Serial.print(",");
      Serial.print(motorProfiles[i].closeDegrees);
      Serial.print(",");
      Serial.println(motorProfiles[i].closeCW);
    }
    return;
  }

  Serial.println("ERROR,Unknown command");
}

// ============================================================================
// NVS STORAGE HELPERS
// ============================================================================
void saveCalibrationToNVS() {
  preferences.putInt("cal_count", calPointCount);
  for (int i = 0; i < calPointCount; i++) {
    String key = "cp_" + String(i);
    preferences.putBytes(key.c_str(), &calPoints[i], sizeof(CalibrationPoint));
  }
}

void loadCalibrationFromNVS() {
  calPointCount = preferences.getInt("cal_count", 0);
  if (calPointCount > MAX_CALIBRATION_POINTS) calPointCount = MAX_CALIBRATION_POINTS;

  for (int i = 0; i < calPointCount; i++) {
    String key = "cp_" + String(i);
    preferences.getBytes(key.c_str(), &calPoints[i], sizeof(CalibrationPoint));
  }
}

void saveProfilesToNVS() {
  preferences.putInt("mp_count", motorProfileCount);
  for (int i = 0; i < motorProfileCount; i++) {
    String key = "mp_" + String(i);
    preferences.putBytes(key.c_str(), &motorProfiles[i], sizeof(MotorProfile));
  }
}

void loadProfilesFromNVS() {
  motorProfileCount = preferences.getInt("mp_count", 0);
  if (motorProfileCount > MAX_MOTOR_PROFILES) motorProfileCount = MAX_MOTOR_PROFILES;

  for (int i = 0; i < motorProfileCount; i++) {
    String key = "mp_" + String(i);
    preferences.getBytes(key.c_str(), &motorProfiles[i], sizeof(MotorProfile));
  }
}

// ============================================================================
// INTERPOLATION HELPERS
// ============================================================================
float calculateEstimatedVolume(long raw) {
  if (calPointCount < 2) return 0.0;

  // Simple linear segment search
  for (int i = 0; i < calPointCount - 1; i++) {
    long r1 = calPoints[i].averageRaw;
    long r2 = calPoints[i + 1].averageRaw;
    float v1 = calPoints[i].volumeMl;
    float v2 = calPoints[i + 1].volumeMl;

    if ((r1 <= raw && raw <= r2) || (r2 <= raw && raw <= r1)) {
      if (r1 == r2) return v1;
      float ratio = (float)(raw - r1) / (float)(r2 - r1);
      return v1 + ratio * (v2 - v1);
    }
  }

  // Clamped to bounds
  return calPoints[0].volumeMl;
}

int findProfileCloseAngle(float volumeMl, int& outDirection) {
  if (motorProfileCount == 0) {
    outDirection = 0; // CCW
    return 180;       // default fallback
  }

  // Find nearest or interpolate
  int bestIdx = 0;
  float minDiff = 999999.0;
  for (int i = 0; i < motorProfileCount; i++) {
    float diff = abs(motorProfiles[i].volumeMl - volumeMl);
    if (diff < minDiff) {
      minDiff = diff;
      bestIdx = i;
    }
  }

  outDirection = motorProfiles[bestIdx].closeCW;
  return motorProfiles[bestIdx].closeDegrees;
}

