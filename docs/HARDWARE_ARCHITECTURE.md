# GRIDGUARD — Hardware Architecture & Electrical Specification

## 1. Primary Hardware Inventory

| Component Category | Device / Model | Qty | Key Electrical Specifications | Architectural Role |
|---|---|---|---|---|
| **Microcontroller** | ESP32-S3 N16R8 | 1 | Dual-core Xtensa LX7 @ 240MHz, 16MB Flash, 8MB Octal PSRAM, 12-bit SAR ADC DMA | Authoritative Edge Protection & Telemetry |
| **System Meter** | PZEM-004T V3.0 | 1 | 80–260VAC, 0–100A, Active Power (W), Energy (kWh), Frequency (Hz), PF, UART TTL | Bulk System Electrical Measurement |
| **Voltage Transducers**| ZMPT101B | 4 | Precision micro-voltage transformer, high linearity, operational amplifier output | Per-Channel Branch Voltage Sensing |
| **Current Transducers**| ACS712-05B | 4 | Hall-effect isolated sensor, 185 mV/A sensitivity, 2.1 kV RMS galvanic isolation | Per-Channel Branch Current Sensing |
| **Switching Stage** | 5V Relay Modules | 8 | 10A 250VAC / 30VDC rated, optocoupler-isolated inputs, SPDT form-C contacts | 4 × Main Protection + 4 × Auxiliary Stage |
| **Prototype Loads** | Incandescent Bulbs| 4 | 230VAC 40W–100W emulated branch loads | Emulated Transformer Feeder Branches |
| **Biometric Reset** | HD Webcam + Host | 1 | OpenCV / Local CNN Face Recognition pipeline | Safety Reset Authorization Gate |

---

## 2. Electrical Wiring Topology & Power Distribution

The physical prototype is powered from standard AC single-phase mains supply (230V RMS, 50 Hz).

### Branch Sequence
For each of the 4 prototype load channels, the following strict conductor sequence is maintained:

```
AC LIVE (Common Distribution Bus)
   │
   ▼
ZMPT101B Voltage Transformer (High-impedance AC sensing)
   │
   ▼
Main Relay (Normally Open Contact)
   │
   ▼
Auxiliary Relay (Normally Open Contact)
   │
   ▼
ACS712 Current Sensor (In-line current path sensing ONLY)
   │
   ▼
Prototype Bulb Load (Branch Feeder)
   │
   ▼
AC COMMON NEUTRAL
```

> **CRITICAL ELECTRICAL RESTRICTION**:
> The ACS712 measures current **strictly through its low-resistance copper conduction path** on the live line. Live and neutral are NEVER routed together across the ACS712 sensing element.

---

## 3. Relay Commanded State vs Physical Feedback
Standard 5V hobbyist relay boards utilize SPDT relays without auxiliary dry contacts or optical contact position sensors. 

- The firmware and SCADA dashboard explicitly state:
  ```
  COMMANDED STATE: CLOSED (ON) | OPEN (OFF)
  PHYSICAL FEEDBACK: NOT AVAILABLE (Standard SPDT Modules)
  ```
- The system **never falsely asserts** `RELAY HEALTH = GOOD` based merely on issuing a GPIO write. Command health is tracked separately from contact continuity.

---

## 4. Hardware Abstraction Layer (HAL)
To prevent GPIO collisions and ensure maintainability, all GPIO assignments are consolidated into typed configuration structs (`firmware/gridguard_hal.h`):

```c
typedef struct {
    uint8_t channel_id;
    SensorConfig voltage_sensor;
    SensorConfig current_sensor;
    RelayConfig main_relay;
    RelayConfig aux_relay;
    ProtectionConfig protection;
} ChannelConfig;
```

At system startup, `verifyGpioAssignments()` executes a collision check. If any duplicate GPIO pin assignment is detected, the firmware halts normal boot, reports the duplicate pin numbers, and raises `HARDWARE_CONFIG_ERROR`.
