# GRIDGUARD Architecture & Engineering Documentation

## 1. System Philosophy & Purpose
**GRIDGUARD** is an Industrial IoT, Protection, Digital Twin, and AI Operations platform engineered for **Smart Transformer Protection and Assistive Load Control**.

> **Crucial Engineering Prototype Distinction**:
> There are **NO physical transformers in the prototype**. Four incandescent/resistive bulbs serve as **Prototype Load Channels** to emulate the four transformer/load channels. They are strictly designated as *"Prototype Load Channels"* and never described as physical transformers.

---

## 2. Strict Zero Temperature Restriction
There are **zero temperature sensors** in the hardware setup. Under absolute architectural rules:
- No temperature cards, fields, graphs, alerts, prediction, or database columns exist.
- System metrics are purely electrical: Voltage, Current, Active Power, Apparent Power, Frequency, Energy, and Power Factor.

---

## 3. Hardware Architecture & Channel Mapping
- **Controller**: ESP32-S3 N16R8 (Dual-Core Xtensa LX7, 16MB Flash, 8MB Octal PSRAM).
- **Overall System Electrical Meter**: 1 × PZEM-004T V3.0 (measures Mains Voltage, Total Current, Active Power, Frequency, Energy, and Power Factor).
- **Individual Channel Voltage Sensing**: 4 × ZMPT101B Active Transformer Voltage Sensors.
- **Individual Channel Current Sensing**: 4 × ACS712 Hall-Effect Current Sensors.
- **Relay System**: 8 × 5V Relays (4 Main Relays + 4 Auxiliary Relays).
- **Prototype Loads**: 4 Bulbs representing the four transformer/load channels.
- **Wiring**: Neutral conductor is common across all channels; live conductor is switched through the relay/load path.

### Channel Flow:
```
AC LIVE ➔ ZMPT101B ➔ Main Relay ➔ Aux Relay ➔ ACS712 ➔ Prototype Bulb ➔ Common Neutral
```

---

## 4. Protection Hierarchy & Edge Authoritativeness
The website and cloud are **monitoring and supervisory** layers. The protection hierarchy is:
1. **ESP32-S3 Local FreeRTOS Protection Loop (Core 1, 10ms cycle)**:
   - High-speed ADC sampling and RMS calculation.
   - Deterministic threshold evaluation with persistence duration (1.0s) and hysteresis (5%).
   - Direct hardware GPIO relay tripping in <10ms.
   - Autonomous fault latching (relays stay OPEN until authorized reset).
2. **HiveMQ Private Cloud Broker**: Ingests telemetry under `smarttransformer/*`.
3. **Node-RED**: Ingests, validates, formats, and routes alerts.
4. **FastAPI Backend**: Persists to PostgreSQL/SQLite, handles WebSocket multiplexing, ML forecasting, and Gemini AI context.
5. **Next.js Web Platform**: 17 operational views for operators and engineers.

> **Safety Invariant**: If Wi-Fi, MQTT, Node-RED, Backend, Database, Website, or Gemini AI fails, **ESP32 local hardware protection continues without interruption**.

---

## 5. Laptop Face-Recognition Reset Authorization Flow
When a critical fault occurs, it enters `FAULT LATCHED`:
```
FAULT OCCURS ➔ RELAYS TRIP ➔ FAULT LATCHED
                       │
                       ▼
            OPERATOR RESET REQUEST
                       │
                       ▼
       LAPTOP CAMERA FACE RECOGNITION (Confidence >= 0.75)
                       │
                       ▼
                 AUTHORIZED?
                ├── No  ➔ REJECT & MAINTAIN RELAYS OPEN
                └── Yes ➔ PRE-CLOSURE SAFETY CHECK
                               │
                               ▼
                    RELAYS CLOSE & UNLATCH
                               │
                               ▼
               STABILIZATION (NORMAL OR RETRIP)
```
AI (Gemini) cannot trip relays, alter safety limits, or authorize resets. It remains strictly advisory.
