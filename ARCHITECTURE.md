# GRIDGUARD — SYSTEM ARCHITECTURE SPECIFICATION
**Project Name**: GRIDGUARD — Smart Transformer Protection & Assistive Load Device  
**Tagline**: *Intelligent Protection. Real-Time Visibility.*

---

## 1. Prototype Load Channel Invariant
- **CRUCIAL TERMINOLOGY**: There are **NO physical transformers in the prototype**.
- Four 230V incandescent/resistive bulbs serve as **Prototype Load Channels** to emulate the four transformer/load channels of the proposed protection system.
- The software, dashboard, API, models, and firmware strictly use the designation **"Prototype Load Channel"** throughout. Bulbs are never described as physical transformers.

---

## 2. Absolute Hardware & Zero-Temperature Rule
- **Main Controller**: ESP32-S3 N16R8 (16MB Flash, 8MB Octal PSRAM)
- **Overall System Electrical Meter**: 1 × PZEM-004T V3.0
- **Individual Channel Sensing**: 4 × ZMPT101B (Voltage) + 4 × ACS712 (Current)
- **Protection Outputs**: 8 × 5V Relays (4 Main Relays + 4 Auxiliary Relays)
- **Loads**: 4 Prototype Load Channels (Bulbs)
- **STRICT ZERO-TEMPERATURE POLICY**: There are **ZERO temperature sensors** in the hardware.
  - NO temperature field.
  - NO temperature database column.
  - NO temperature API endpoint.
  - NO temperature MQTT topic.
  - NO temperature chart or widget.
  - NO temperature alert or notification.
  - NO thermal model or AI prediction.
  - NO temperature maintenance logic.

---

## 3. End-to-End System Pipeline
```
               ┌─────────────────┐
               │    ESP32-S3     │ (FreeRTOS Core 1: 10ms Protection Loop)
               │     N16R8       │ (FreeRTOS Core 0: Telemetry & MQTT Task)
               └────────┬────────┘
                        │
                        │ MQTT TLS (Port 8883)
                        ▼
               ┌─────────────────┐
               │  HiveMQ Cloud   │ (260e034f069c4cb895d24c44549ac094.s1.eu.hivemq.cloud)
               └────────┬────────┘
                        │
                        ▼
               ┌─────────────────┐
               │    Node-RED     │ (Authoritative MQTT Ingestion & Zero-Temp Validation)
               └────────┬────────┘
                        │ HTTP Ingest (/api/telemetry/*)
                        ▼
               ┌─────────────────┐
               │    FastAPI      │ (Python 3.12, AsyncPG, Pydantic v2)
               └──────┬───┬──────┘
                      │   │
                      │   └──────────────┐
                      ▼                  │
               ┌──────────────┐          │
               │  PostgreSQL  │          │
               └──────────────┘          │
                                        │
                                        ▼
                               ┌─────────────────┐
                               │    WebSocket    │ (/ws/live multiplexer)
                               └────────┬────────┘
                                        │
                                        ▼
                               ┌─────────────────┐
                               │ Next.js / React │ (GRIDGUARD SCADA Dashboard)
                               └─────────────────┘
```

---

## 4. Per-Channel Electrical Signal Path
```
AC LIVE (230V RMS, 50Hz)
  │
  ├── ZMPT101B Voltage Sensing (ADC Analog Input)
  │
  ├── Main Relay (Series Redundant Isolation 1)
  │
  ├── Auxiliary Relay (Series Redundant Isolation 2)
  │
  ├── ACS712 Current Sensing (ADC Analog Input)
  │
  ├── Prototype Bulb / Load (Prototype Channel)
  │
  └── Common Neutral Return
```

### Metrics Definition:
- **Individual Channel Apparent Power**: $S = V_{\text{ZMPT}} \times I_{\text{ACS}}$ in **Volt-Amperes (VA)**.
- *Apparent power is NEVER mislabeled as "active power"*.
- **System-Wide PZEM-004T Meter**: Measures true active power (W), RMS voltage (V), total current (A), energy (kWh), grid frequency (Hz), and power factor.

---

## 5. Protection & Edge Authority Hierarchy
1. **ESP32-S3 Hardware Authority**: Local FreeRTOS protection task running on Core 1 every 10ms evaluates overcurrent, overvoltage, undervoltage, and overload conditions.
2. **Deterministic Trip**: Relays trip in $<10\text{ms}$ upon fault persistence ($1000\text{ms}$). Both Main and Auxiliary relays open, latching into `FAULT LATCHED` state.
3. **Fail-Safe Invariant**: If Wi-Fi, MQTT, Node-RED, Backend, WebSocket, or Frontend crashes, **ESP32 local hardware protection continues without interruption**.
4. **Physical Relay Feedback**: If physical contact sensing hardware is unavailable, the UI states: `COMMANDED STATE: ON/OFF`, `FEEDBACK: NOT AVAILABLE`. Physical confirmation is never fabricated.
