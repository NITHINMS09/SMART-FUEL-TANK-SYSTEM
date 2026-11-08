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
// Calibration and Motor Profile arrays (RAM caches synced with Preferences NVS)

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
bool isHX711Ready();
bool waitHX711Ready(unsigned long timeoutMs = 150);
void processCommand(const String& cmd);
bool saveCalibrationToNVS();
void loadCalibrationFromNVS();
bool saveProfilesToNVS();
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
  loadCalibrationFromNVS();
  loadProfilesFromNVS();

  delay(200);
  Serial.println("SYSTEM_READY");
  Serial.flush();
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
// HX711 24-BIT BIT-BANG READ & TIMEOUT HANDLING
// ============================================================================
bool isHX711Ready() {
  return digitalRead(PIN_HX711_DT) == LOW;
}

bool waitHX711Ready(unsigned long timeoutMs) {
  unsigned long start = millis();
  while (digitalRead(PIN_HX711_DT) != LOW) {
    if (millis() - start >= timeoutMs) {
      return false; // Hardware timeout
    }
    delayMicroseconds(200);
    yield(); // Prevent hardware watchdog reset during wait
  }
  return true;
}

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
    // Format: CAL,<ml> or CAL,<ml>,<threshold>
    int commaIdx = cmd.indexOf(',', 4);
    float ml = 0;
    long maxAllowedRange = STABILITY_THRESHOLD;
    if (commaIdx != -1) {
      String mlStr = cmd.substring(4, commaIdx);
      mlStr.trim();
      ml = mlStr.toFloat();
      String thStr = cmd.substring(commaIdx + 1);
      thStr.trim();
      maxAllowedRange = thStr.toInt();
      if (maxAllowedRange <= 0) maxAllowedRange = STABILITY_THRESHOLD;
    } else {
      String mlStr = cmd.substring(4);
      mlStr.trim();
      ml = mlStr.toFloat();
    }

    // Actively sample 20 readings with strict per-sample and total timeout handling
    const int SAMPLES_TARGET = 20;
    long samples[SAMPLES_TARGET];
    int count = 0;
    unsigned long samplingStart = millis();
    const unsigned long TOTAL_TIMEOUT_MS = 3000; // 3 seconds maximum total sampling window

    while (count < SAMPLES_TARGET && (millis() - samplingStart < TOTAL_TIMEOUT_MS)) {
      // Wait for HX711 to indicate data ready with 150ms timeout per sample
      if (waitHX711Ready(150)) {
        long val = readHX711Raw();
        samples[count++] = val;

        // Also update the sliding buffer so live monitoring and auto-leveling stay current
        rawSamples[sampleIndex] = val;
        sampleIndex = (sampleIndex + 1) % SAMPLE_WINDOW;
        if (sampleIndex == 0) bufferFilled = true;

        // Stream raw telemetry value to maintain continuous dashboard feed
        Serial.print("RAW,");
        Serial.println(val);

        // Small delay between acquisitions to allow HX711 conversion cycle
        delay(10);
      } else {
        // Feed watchdog and give processor a chance to handle background tasks
        yield();
        delay(5);
      }
    }

    // If timeout occurred and fewer than 20 samples were actively acquired:
    if (count < SAMPLES_TARGET) {
      // Fallback: fill remaining slots from the sliding window buffer if available
      int slidingAvailable = bufferFilled ? SAMPLE_WINDOW : sampleIndex;
      if (slidingAvailable > 0) {
        for (int i = 0; i < slidingAvailable && count < SAMPLES_TARGET; i++) {
          samples[count++] = rawSamples[i];
        }
      }
    }

    // If still 0 samples, the HX711 hardware is disconnected or unresponsive
    if (count == 0) {
      Serial.println("ERROR,HX711 sensor hardware not responding during calibration sampling");
      Serial.println("CAL_REJECTED,NO_HARDWARE_RESPONSE");
      return;
    }

    long minVal = samples[0];
    long maxVal = samples[0];
    long sum = 0;
    for (int i = 0; i < count; i++) {
      long val = samples[i];
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
      sum += val;
    }

    long avgVal = sum / count;
    long rangeVal = maxVal - minVal;

    // Report CAL_RESULT: CAL_RESULT,<ml>,<average>,<minimum>,<maximum>,<range>
    Serial.print("CAL_RESULT,");
    if (ml == (long)ml) {
      Serial.print((long)ml);
    } else {
      Serial.print(ml, 1);
    }
    Serial.print(",");
    Serial.print(avgVal);
    Serial.print(",");
    Serial.print(minVal);
    Serial.print(",");
    Serial.print(maxVal);
    Serial.print(",");
    Serial.println(rangeVal);
    Serial.flush();

    if (rangeVal > maxAllowedRange) {
      Serial.println("CAL_REJECTED,UNSTABLE");
      Serial.flush();
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

    bool nvsSaved = saveCalibrationToNVS();
    if (nvsSaved) {
      Serial.println("CAL_ACCEPTED");
      Serial.println("CALIBRATION_SAVED");
      Serial.print("CALIBRATION_COUNT,");
      Serial.println(calPointCount);
      Serial.flush();
    } else {
      Serial.println("ERROR,Failed to commit calibration point to ESP32 flash memory");
      Serial.println("CAL_REJECTED,NVS_SAVE_FAILED");
      Serial.flush();
    }
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

  if (cmd.startsWith("DEL_CAL,")) {
    float ml = cmd.substring(8).toFloat();
    int foundIdx = -1;
    for (int i = 0; i < calPointCount; i++) {
      if (abs(calPoints[i].volumeMl - ml) < 0.1) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx != -1) {
      for (int i = foundIdx; i < calPointCount - 1; i++) {
        calPoints[i] = calPoints[i + 1];
      }
      calPointCount--;
      saveCalibrationToNVS();
      Serial.print("CAL_DELETED,");
      if (ml == (long)ml) {
        Serial.println((long)ml);
      } else {
        Serial.println(ml, 1);
      }
      Serial.print("CALIBRATION_COUNT,");
      Serial.println(calPointCount);
      Serial.flush();
    } else {
      Serial.println("ERROR,Calibration point not found");
      Serial.flush();
    }
    return;
  }

  if (cmd == "CLEAR_CAL") {
    calPointCount = 0;
    saveCalibrationToNVS();
    Serial.println("CAL_CLEARED");
    Serial.println("CALIBRATION_COUNT,0");
    Serial.flush();
    return;
  }

  if (cmd == "GET_DATA") {
    // Report calibration points
    for (int i = 0; i < calPointCount; i++) {
      Serial.print("CAL_POINT,");
      if (calPoints[i].volumeMl == (long)calPoints[i].volumeMl) {
        Serial.print((long)calPoints[i].volumeMl);
      } else {
        Serial.print(calPoints[i].volumeMl, 1);
      }
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
      if (motorProfiles[i].volumeMl == (long)motorProfiles[i].volumeMl) {
        Serial.print((long)motorProfiles[i].volumeMl);
      } else {
        Serial.print(motorProfiles[i].volumeMl, 1);
      }
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
bool saveCalibrationToNVS() {
  if (calPointCount < 0) calPointCount = 0;
  if (calPointCount > MAX_CALIBRATION_POINTS) calPointCount = MAX_CALIBRATION_POINTS;

  Preferences prefs;
  if (!prefs.begin("smart_tank", false)) {
    Serial.println("ERROR,Failed to open NVS namespace 'smart_tank'");
    return false;
  }

  size_t wCount = prefs.putInt("cal_count", calPointCount);
  bool allOk = (wCount > 0 || calPointCount == 0);

  for (int i = 0; i < calPointCount; i++) {
    char key[16];
    snprintf(key, sizeof(key), "cp_%d", i);
    size_t written = prefs.putBytes(key, &calPoints[i], sizeof(CalibrationPoint));
    if (written != sizeof(CalibrationPoint)) {
      allOk = false;
    }
  }
  prefs.end();
  return allOk;
}

void loadCalibrationFromNVS() {
  Preferences prefs;
  if (!prefs.begin("smart_tank", true)) {
    calPointCount = 0;
    return;
  }
  calPointCount = prefs.getInt("cal_count", 0);
  if (calPointCount < 0) calPointCount = 0;
  if (calPointCount > MAX_CALIBRATION_POINTS) calPointCount = MAX_CALIBRATION_POINTS;

  for (int i = 0; i < calPointCount; i++) {
    char key[16];
    snprintf(key, sizeof(key), "cp_%d", i);
    prefs.getBytes(key, &calPoints[i], sizeof(CalibrationPoint));
  }
  prefs.end();
}

bool saveProfilesToNVS() {
  if (motorProfileCount < 0) motorProfileCount = 0;
  if (motorProfileCount > MAX_MOTOR_PROFILES) motorProfileCount = MAX_MOTOR_PROFILES;

  Preferences prefs;
  if (!prefs.begin("smart_tank", false)) {
    Serial.println("ERROR,Failed to open NVS namespace for motor profiles");
    return false;
  }

  size_t wCount = prefs.putInt("mp_count", motorProfileCount);
  bool allOk = (wCount > 0 || motorProfileCount == 0);

  for (int i = 0; i < motorProfileCount; i++) {
    char key[16];
    snprintf(key, sizeof(key), "mp_%d", i);
    size_t written = prefs.putBytes(key, &motorProfiles[i], sizeof(MotorProfile));
    if (written != sizeof(MotorProfile)) {
      allOk = false;
    }
  }
  prefs.end();
  return allOk;
}

void loadProfilesFromNVS() {
  Preferences prefs;
  if (!prefs.begin("smart_tank", true)) {
    motorProfileCount = 0;
    return;
  }
  motorProfileCount = prefs.getInt("mp_count", 0);
  if (motorProfileCount < 0) motorProfileCount = 0;
  if (motorProfileCount > MAX_MOTOR_PROFILES) motorProfileCount = MAX_MOTOR_PROFILES;

  for (int i = 0; i < motorProfileCount; i++) {
    char key[16];
    snprintf(key, sizeof(key), "mp_%d", i);
    prefs.getBytes(key, &motorProfiles[i], sizeof(MotorProfile));
  }
  prefs.end();
}

// ============================================================================
// INTERPOLATION HELPERS
// ============================================================================
float calculateEstimatedVolume(long raw) {
  if (calPointCount < 2) return 0.0;

  // Find lowest volume index (empty baseline) and highest volume index
  int emptyIdx = 0;
  int fullIdx = 0;
  for (int i = 1; i < calPointCount; i++) {
    if (calPoints[i].volumeMl < calPoints[emptyIdx].volumeMl) emptyIdx = i;
    if (calPoints[i].volumeMl > calPoints[fullIdx].volumeMl) fullIdx = i;
  }

  bool isDirect = calPoints[fullIdx].averageRaw >= calPoints[emptyIdx].averageRaw;

  // Clamping for empty tank baseline (0 ml)
  if (calPoints[emptyIdx].volumeMl == 0) {
    if (isDirect && raw <= calPoints[emptyIdx].averageRaw) return 0.0;
    if (!isDirect && raw >= calPoints[emptyIdx].averageRaw) return 0.0;
  }

  // Linear interpolation across segments
  for (int i = 0; i < calPointCount - 1; i++) {
    long r1 = calPoints[i].averageRaw;
    long r2 = calPoints[i + 1].averageRaw;
    float v1 = calPoints[i].volumeMl;
    float v2 = calPoints[i + 1].volumeMl;

    if ((r1 <= raw && raw <= r2) || (r2 <= raw && raw <= r1)) {
      if (r1 == r2) return v1;
      float ratio = (float)(raw - r1) / (float)(r2 - r1);
      float vol = v1 + ratio * (v2 - v1);
      return vol < 0 ? 0.0 : vol;
    }
  }

  // Clamped to bounds
  return isDirect ? (raw < calPoints[emptyIdx].averageRaw ? calPoints[emptyIdx].volumeMl : calPoints[fullIdx].volumeMl)
                  : (raw > calPoints[emptyIdx].averageRaw ? calPoints[emptyIdx].volumeMl : calPoints[fullIdx].volumeMl);
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

