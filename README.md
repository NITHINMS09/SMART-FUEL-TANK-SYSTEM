# SMART TANK CONTROL CENTER
### ESP32-S3 Intelligent Liquid Measurement & Automatic Stepper Cap Control Center

A high-reliability, professional industrial IoT web application engineered for precision liquid volume measurement and automatic motor cap actuation using an **ESP32-S3**, **HX711 24-bit ADC**, and **DRV8825 stepper motor controller**.

Communicates directly with the ESP32-S3 over USB Serial using the browser **Web Serial API** at **115200 baud**.

---

## 1. Quick Start

### Prerequisites
- **Node.js** (v18+ recommended)
- **Chromium-based browser** (Google Chrome, Microsoft Edge, Opera, Brave) for Web Serial API support.

### Installation & Launch
```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev
```

Open your browser at:
```
http://localhost:3000
```

> **Note:** Operates 100% locally with zero cloud dependencies and no internet required for normal operation.

---

## 2. Hardware Architecture & Pin Mapping

The system interfaces with an **ESP32-S3** microcontroller with the following hardware pin assignments:

| Peripheral | Signal / Pin | ESP32-S3 GPIO | Description |
| :--- | :--- | :--- | :--- |
| **HX711** | `DT` (Data) | **GPIO 16** | 24-bit Sigma-Delta ADC Serial Data Output |
| **HX711** | `SCK` (Clock) | **GPIO 17** | Serial Clock Input (pulses for bit extraction & gain selection) |
| **DRV8825** | `STEP` | **GPIO 4** | Stepper Step Pulse Input |
| **DRV8825** | `DIR` | **GPIO 5** | Direction Control (High: CW / Low: CCW) |
| **DRV8825** | `EN` | **GPIO 6** | Motor Enable / Coil De-energize |
| **USB Serial** | `VCP / COM` | Native USB CDC | 115200 Baud, 8-N-1 |

---

## 3. Communication Protocol (Line-Based Serial with `\n`)

All commands are terminated with newline (`\n`). Handled asynchronously via a non-blocking queue to prevent overlapping commands or motor stalls.

### Outgoing Commands (Web $\rightarrow$ ESP32)
- `CAL,<ml>`: Initiates load cell calibration for known volume (e.g., `CAL,500`).
- `PROFILE,<ml>,<openDegrees>,<openCW>,<closeDegrees>,<closeCW>`: Saves dual cap open & close profile to ESP32 Preferences/NVS (e.g. `PROFILE,500,360,1,450,0`).
- `OPEN,<degrees>,<CW or CCW>`: Direct open rotation test (e.g., `OPEN,90,CW`).
- `CLOSE,<degrees>,<CW or CCW>`: Direct close rotation test (e.g., `CLOSE,180,CCW`).
- `AUTO_CLOSE`: Triggers automated closing sequence (sample $\rightarrow$ calculate $\rightarrow$ interpolate angle $\rightarrow$ execute).
- `READ_VOLUME`: Queries estimated water volume.
- `GET_DATA`: Queries stored calibration points, motor profiles, and hardware status from ESP32 NVS.
- `STOP`: Emergency stop override command (immediately clears command queue and disables coils).

### Incoming Responses (ESP32 $\rightarrow$ Web)
- `RAW,<value>`: Streaming 24-bit strain gauge ADC reading.
- `CAL_RESULT,<ml>,<average>,<minimum>,<maximum>,<range>`: ESP32 calculation report.
- `CAL_ACCEPTED`: Calibration point verified and saved.
- `CAL_REJECTED,UNSTABLE` (or reason): Calibration rejected due to fluctuation.
- `CALIBRATION_SAVED`: NVS write confirmation.
- `CALIBRATION_COUNT,<count>`: Number of points stored in NVS.
- `PROFILE_SAVED`: Profile stored in NVS.
- `CURRENT_VOLUME,<ml>`: Volume response.
- `AUTO_VOLUME,<ml>`: Automated cycle measured volume.
- `AUTO_ROTATION,<degrees>`: Automated cycle executed rotation angle.
- `MOTOR_STARTED`: Stepper execution commenced.
- `MOTOR_COMPLETED`: Stepper execution finished.
- `SYSTEM_READY`: Hardware initialization confirmed.
- `ERROR,<message>`: Firmware error alert.

---

## 4. Key Functional Modules

### 1. Dashboard
- Live hardware telemetry cards (ESP32 USB connection, HX711 status, DRV8825 driver status).
- Live 24-bit raw reading, 20-sample average, minimum, maximum, spread range, and estimated volume.
- Real-time oscilloscope chart of the last 20 raw readings.
- Separate volume progression chart.
- Rapid action bar for instant Cap Open and Cap Closed commands.

### 2. Live Monitoring
- Continuously updated 20-sample sliding window analysis.
- Live stability evaluation (`STABLE`, `UNSTABLE`, `WAITING FOR READINGS`).
- Configurable raw stability threshold (default $\le$ 50 units).
- Strict data integrity: **never shows fabricated volume when uncalibrated**.

### 3. Load Cell Calibration
- Step-by-step reference calibration for up to 30 volume points (e.g., 0 ml, 100 ml, 200 ml, 500 ml, 1000 ml).
- Validates 20 readings stability before sending `CAL,<ml>`.
- Point is only saved upon receiving `CAL_ACCEPTED` from firmware.
- Recharts linear calibration curve graph with live position indicator.
- Sortable, editable, and exportable calibration points table.
- Supports raw readings that increase or decrease with water volume.
- Flags out-of-range warnings whenever sensor readings lie outside calibrated bounds.

### 4. Motor Configuration
- Dual configuration for **CAP OPEN** and **CAP CLOSED** for every configured water volume.
- Configurable degrees ($0-7200^\circ$), direction (Clockwise / Anticlockwise), speed, and acceleration.
- Linear interpolation of rotation angles for volumes falling between configured profile points.
- Instant rotation test buttons.

### 5. Motor Testing
- Dedicated jog pad with degree slider, speed control, CW, CCW, and prominent Emergency Stop button.
- Command interlock: blocks conflicting motor commands while motor is running.
- Safety precautions card for physical mechanical assembly.

### 6. Automation
- **MANUAL MODE**: Operator controls Cap Open and Cap Closed actions directly.
- **AUTOMATIC MODE**:
  1. Sends `AUTO_CLOSE` to ESP32.
  2. Collects 20 samples from HX711.
  3. Calculates average raw reading.
  4. Interpolates liquid volume in ml.
  5. Selects bounding profiles and linearly interpolates closing rotation angle.
  6. Directs stepper motor rotation to seal the cap.
  7. Displays measured volume, rotation, and logs to history.
- Operation history log with timestamp, volume, degrees, direction, and status.

### 7. Device Settings
- Configurable serial baud rate (115200 default).
- Raw reading stability threshold.
- Number of calibration samples (20).
- Motor microstepping resolution (Full to 1/32 step), steps per revolution, max speed, and acceleration.
- Read-only hardware pin assignments reference.

### 8. Data Backup
- Export calibration points, motor profiles, or full system state to JSON.
- Import JSON backup with structural validation and overwrite confirmation.
- Authoritative synchronization with ESP32 NVS via `GET_DATA`.

---

## 5. Technology Stack

- **React 18** with **TypeScript**
- **Vite**
- **Tailwind CSS** (Dark Industrial cyber theme)
- **Lucide React** (Industrial IoT iconography)
- **Recharts** (Real-time oscilloscope and calibration curve charts)
- **Web Serial API** (`navigator.serial`)
