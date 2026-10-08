# GRIDGUARD ESP32-S3 N16R8 Production Firmware

## 1. System Overview

**GRIDGUARD** is a high-speed, hardware-authoritative smart transformer protection and assistive load control device built for the **ESP32-S3 N16R8** microcontroller (16 MB Quad-SPI Flash, 8 MB Octal PSRAM).

The firmware executes preemptive dual-core FreeRTOS tasks to guarantee that local electrical protection decisions (trip and staged assist) execute deterministically in **< 10 milliseconds** without blocking on Wi-Fi, TLS handshakes, or MQTT latency.

```
┌────────────────────────────────────────────────────────┐
│                      ESP32-S3                          │
│                                                        │
│  CORE 1 (Priority 5, High-Speed Protection):           │
│  - 600-sample ADC Waveform Capture (60 ms = 3 cycles)  │
│  - True Active Power Calculation: P = avg(v(t) * i(t)) │
│  - 7 W / 12 W Threshold Decision Engine                │
│  - Local Relay Hardware Protection (< 10 ms trip)      │
│  - NVS Persistent Latch Storage                        │
│                                                        │
│  CORE 0 (Priority 1, Communications & Scada):          │
│  - Non-blocking Wi-Fi State Machine with Backoff       │
│  - TLS 8883 MQTT Client (HiveMQ Cloud, ISRG Root X1)   │
│  - NTP Wall-Clock Time Synchronization                 │
│  - Telemetry & Heartbeat Dispatch                      │
│  - Authorized Inbound Command Execution                │
└────────────────────────────────────────────────────────┘
```

---

## 2. Target Hardware & Pin Mapping

| Subsystem | Signal Name | ESP32-S3 GPIO | Electrical Description / Type |
|---|---|---|---|
| **System Meter** | PZEM RX | **GPIO 16** | Connects to PZEM-004T V3.0 TX (UART2 RX) |
| | PZEM TX | **GPIO 17** | Connects to PZEM-004T V3.0 RX (UART2 TX) |
| **Channel 1** | ZMPT101B ADC | **GPIO 4** | ADC1_CH3 (Voltage Sensing) |
| | ACS712 ADC | **GPIO 8** | ADC1_CH7 (Current Sensing) |
| | Main Relay | **GPIO 12** | Active LOW digital output (Series contact) |
| | Aux Relay | **GPIO 18** | Active LOW digital output (Assistive contact) |
| **Channel 2** | ZMPT101B ADC | **GPIO 5** | ADC1_CH4 (Voltage Sensing) |
| | ACS712 ADC | **GPIO 9** | ADC1_CH8 (Current Sensing) |
| | Main Relay | **GPIO 13** | Active LOW digital output |
| | Aux Relay | **GPIO 11** | Active LOW digital output |
| **Channel 3** | ZMPT101B ADC | **GPIO 6** | ADC1_CH5 (Voltage Sensing) |
| | ACS712 ADC | **GPIO 10** | ADC1_CH9 (Current Sensing) |
| | Main Relay | **GPIO 14** | Active LOW digital output |
| | Aux Relay | **GPIO 38** | Active LOW digital output |
| **Channel 4** | ZMPT101B ADC | **GPIO 7** | ADC1_CH6 (Voltage Sensing) |
| | ACS712 ADC | **GPIO 1** | ADC1_CH0 (Current Sensing) |
| | Main Relay | **GPIO 15** | Active LOW digital output |
| | Aux Relay | **GPIO 21** | Active LOW digital output |
| **USB Safety** | USB D- / D+ | **GPIO 19, 20** | **STRICTLY RESERVED FOR NATIVE USB. NEVER ASSIGN TO RELAYS.** |

> [!CAUTION]
> Relay control logic is strictly **Active LOW** (`LOW = ON`, `HIGH = OFF`). On boot, all relays are initialized to `HIGH` (OFF) before persistent fault states are restored.
> The prototype relays have **NO physical contact feedback microswitches**. The firmware authoritatively reports `relay_feedback = "NOT_AVAILABLE"`.

---

## 3. Active Power Protection Policy

Active power is calculated using true time-domain integral averaging across multiple complete AC cycles:

$$P = \frac{1}{N} \sum_{k=0}^{N-1} v(t_k) \cdot i(t_k)$$

Sampling parameters:
- **Sample count:** $N = 600$ samples per channel
- **Sample interval:** $\Delta t = 100\ \mu\text{s}$
- **Total sample window:** $60.0\text{ ms} = \text{exactly } 3\text{ complete } 50\text{ Hz cycles}$
- **Apparent Power ($S$):** $S = V_{\text{rms}} \times I_{\text{rms}}$ in VA.
- **Power Factor ($\text{PF}$):** $\text{PF} = \frac{|P|}{S}$ (clamped to $[0.0, 1.0]$).

### Channel State Transitions

```
                    ┌────────────────────────────┐
                    │          STARTUP           │
                    │   Relays OFF initially     │
                    └─────────────┬──────────────┘
                                  │
                   NVS Latched? ──┴── No
                  │                    │
                 Yes                   ▼
                  │           ┌──────────────────┐
                  │           │   Main Relay ON  │
                  │           │   Aux Relay OFF  │
                  │           └────────┬─────────┘
                  │                    │
                  ▼                    ▼
        ┌──────────────────┐  Measure P = avg(v*i)
        │     TRIPPED      │           │
        │ Main OFF/Aux OFF │           │
        │  Fault Latched   │           │
        └────────▲─────────┘           │
                 │                     │
      P > 12 W   │     ┌───────────────┼───────────────┐
      (Overload) └─────┤               │               │
                       │               │               │
                       ▼               ▼               ▼
                 [ P <= 7 W ]    [ 7 W < P <= 12 W ]  [ P > 12 W ]
                   NORMAL          HIGH LOAD           TRIPPED
                   Main ON         Main ON             Main OFF
                   Aux OFF         Aux ON (250ms)      Aux OFF
                                   (Assist Mode)       Latch in NVS
```

---

## 4. Reset & Safety Validation Workflow

```
[Operator clicks RESET on Website]
             ↓
[Biometric Face Verification verifies operator]
             ↓
[Backend validates operator & creates authorization token]
             ↓
[MQTT Command published to smarttransformer/commands:
 {
   "command": "RESET",
   "channel": 4,
   "authorized_by": "Lead Operator",
   "authorization_id": "AUTH-9812",
   "correlation_id": "CH4-RESET-20260928-001"
 }]
             ↓
[ESP32 Local Safety Validation]:
 1. Check authorization metadata (authorized_by and authorization_id required)
 2. De-energize both relays (Main OFF, Aux OFF for 100 ms)
 3. Close Main Relay ONLY
 4. Wait 250 ms inrush stabilization delay
 5. Sample waveform and compute Active Power P
 6. Safety Decision:
    - If P <= 7 W:
        Clear NVS latch -> Main ON, Aux OFF -> STATUS_NORMAL
        Publish RESET_CONFIRMED (accepted: true)
    - If 7 W < P <= 12 W:
        Clear NVS latch -> Main ON, Aux ON -> STATUS_HIGH_LOAD
        Publish RESET_CONFIRMED (accepted: true)
    - If P > 12 W:
        Open Main OFF, Aux OFF -> Fault remains LATCHED in NVS
        Publish RESET_REJECTED (accepted: false, reason: "LOAD_STILL_OVER_12W")
```

---

## 5. MQTT Protocol Specification

### 5.1 System Telemetry (`smarttransformer/system`)
Published every 1.0 second from PZEM-004T V3.0 bulk AC mains meter:
```json
{
  "timestamp": "2026-09-28T08:00:00Z",
  "uptime_ms": 124500,
  "device_id": "GRIDGUARD-ESP32-001",
  "voltage": 230.2,
  "current": 0.104,
  "power": 24.0,
  "energy": 0.05,
  "frequency": 50.0,
  "power_factor": 1.0
}
```

### 5.2 Channel Telemetry (`smarttransformer/channel/{1..4}`)
Published every 1.0 second per channel:
```json
{
  "timestamp": "2026-09-28T08:00:00Z",
  "uptime_ms": 124500,
  "device_id": "GRIDGUARD-ESP32-001",
  "channel": 1,
  "voltage": 230.2,
  "current": 0.026,
  "active_power": 6.0,
  "apparent_power_va": 6.0,
  "main_relay": true,
  "aux_relay": false,
  "load": true,
  "status": "NORMAL",
  "fault": null,
  "fault_latched": false,
  "relay_feedback": "NOT_AVAILABLE"
}
```

### 5.3 Heartbeat (`smarttransformer/heartbeat`)
Published every 2.0 seconds:
```json
{
  "device_id": "GRIDGUARD-ESP32-001",
  "hardware_type": "ESP32-S3-N16R8",
  "firmware_version": "1.2.0-prod",
  "timestamp": "2026-09-28T08:00:00Z",
  "uptime_ms": 124500,
  "controller_status": "ONLINE",
  "wifi_status": "CONNECTED",
  "wifi_rssi_dbm": -52,
  "mqtt_status": "CONNECTED",
  "free_heap_bytes": 284100,
  "protection_policy": "7W_12W"
}
```

### 5.4 Command Confirmation (`smarttransformer/commands/status`)
```json
{
  "timestamp": "2026-09-28T08:00:02Z",
  "uptime_ms": 126500,
  "command": "TRIP_CHANNEL",
  "accepted": true,
  "status": "TRIP_CONFIRMED",
  "channel": 4,
  "reason": "TRIP_CONFIRMED",
  "correlation_id": "CH4-TRIP-20260928-001",
  "main_relay": false,
  "aux_relay": false,
  "fault_latched": true,
  "active_power": 0.0
}
```

---

## 6. Build & Flash Instructions

### Prerequisites
- Python 3.10+
- PlatformIO Core (available in project environment: `.\backend\venv\Scripts\python.exe -m platformio`)

### Step 1: Configure Credentials
Create `firmware/esp32_gridguard_main/secrets.h` (or verify existing):
```c
#define WIFI_SSID     "YourSSID"
#define WIFI_PASSWORD "YourPassword"
#define MQTT_BROKER   "260e034f069c4cb895d24c44549ac094.s1.eu.hivemq.cloud"
#define MQTT_PORT     8883
#define MQTT_USERNAME "gridguard_device"
#define MQTT_PASSWORD "tEJWIN@cce@19801983"
```

### Step 2: Build Production Binary
```powershell
.\backend\venv\Scripts\python.exe -m platformio run -d firmware -e esp32-s3-prod
```

### Step 3: Flash to ESP32-S3
Connect ESP32-S3 via USB to your workstation:
```powershell
.\backend\venv\Scripts\python.exe -m platformio run -d firmware -e esp32-s3-prod --target upload
```

### Step 4: Monitor Serial Diagnostics
```powershell
.\backend\venv\Scripts\python.exe -m platformio device monitor -d firmware -b 115200
```

---

## 7. Development Test Mode

To test firmware logic without physical voltage or current sensors connected, compile in Development Test Mode:
```powershell
.\backend\venv\Scripts\python.exe -m platformio run -d firmware -e esp32-s3-test --target upload
```

In test mode:
- The firmware prints: `[DEV TEST MODE ACTIVE - SENSOR INJECTION ENABLED]`
- Injected baseline values:
  - **CH1:** 6.0 W $\to$ `NORMAL` (Main ON, Aux OFF)
  - **CH2:** 9.0 W $\to$ `HIGH LOAD` (Main ON, Aux ON)
  - **CH3:** 6.0 W $\to$ `NORMAL` (Main ON, Aux OFF)
  - **CH4:** 13.4 W $\to$ `TRIPPED` (Main OFF, Aux OFF, Latched)
- Tests all MQTT state machines, commands, and WebSocket synchronizations without physical load devices.

---

## 8. Simulator Parity & Hardware Cutover

The Python Hardware Simulator (`backend/app/simulator/hardware_simulator.py`) and this ESP32-S3 firmware share:
1. **Identical MQTT topics** (`smarttransformer/*`)
2. **Identical JSON telemetry schemas**
3. **Identical command formats** (`TRIP_CHANNEL`, `RESET`, `START_CHANNEL`)
4. **Identical correlation ID status reporting**
5. **Identical 7 W / 12 W protection state machine**

When the physical ESP32-S3 is flashed and powered:
1. Stop the Python simulator: `POST /api/simulator/stop`
2. Switch backend mode: Set `DEVICE_MODE="REAL_HARDWARE"` in `backend/.env`
3. The website immediately displays: `CONTROLLER: ESP32-S3 N16R8 ● ONLINE` and `HARDWARE MODE: REAL ESP32`.
4. Zero code changes required in frontend or backend.
