# GRIDGUARD: Smart Transformer Protection & Assistive Load Device
> *“Intelligent Protection. Real-Time Visibility.”*

![Platform Status](https://img.shields.io/badge/Platform-Operational-emerald?style=flat-square)
![Architecture](https://img.shields.io/badge/Architecture-Industrial%20IoT%20%2B%20Digital%20Twin-blue?style=flat-square)
![Temperature Compliance](https://img.shields.io/badge/Temperature-Zero%20Sensors%20(Strict)-red?style=flat-square)
![Edge Protection](https://img.shields.io/badge/ESP32--S3-Autonomous%20Safety-purple?style=flat-square)

---

## 1. Project Overview
**GRIDGUARD** is a production-structured Industrial IoT, Protection, Digital Twin, and AI Operations platform built for technical exhibitions, SIH hackathons, research demonstrations, and industrial extension.

### Essential Prototype Clarification
- **No Physical Transformers**: The prototype utilizes **four incandescent/resistive bulbs** as **Prototype Load Channels** to emulate the four transformer/load channels. They are strictly designated as *"Prototype Load Channels"* and never described as physical transformers.
- **Strict Zero Temperature Compliance**: There are **zero temperature sensors** in the hardware. Consequently, there is **zero temperature functionality** anywhere in the frontend, backend, database, MQTT, AI, or analytics.
- **Authoritative Edge Protection**: The ESP32-S3 N16R8 executes a deterministic FreeRTOS safety loop on Core 1 (100Hz). If Wi-Fi, MQTT, cloud brokers, the backend, or Gemini AI fails, **hardware protection continues uninterrupted**.

---

## 2. Hardware Architecture

- **Main Controller**: ESP32-S3 N16R8 (16MB Flash, 8MB Octal PSRAM)
- **Overall System Meter**: 1 × PZEM-004T V3.0 (measures Mains Voltage, Total Current, Active Power, Frequency, Energy, and Power Factor)
- **Channel Voltage Sensing**: 4 × ZMPT101B Active Voltage Transformers
- **Channel Current Sensing**: 4 × ACS712 Current Sensors
- **Relay System**: 8 × 5V Relays (4 Main Relays, 4 Auxiliary Relays)
- **Prototype Loads**: 4 Bulbs emulating transformer channels
- **Conductor Routing**: Common neutral across all channels; live conductor is switched through the relay/load path:
  ```
  AC MAINS LIVE ➔ ZMPT101B ➔ Main Relay ➔ Aux Relay ➔ ACS712 ➔ Prototype Bulb ➔ Common Neutral
  ```

---

## 3. Technology Stack

- **Frontend**: Next.js 14+ (App Router), React 18, TypeScript, Tailwind CSS, Lucide React, SVG Digital Twin.
- **Backend**: Python 3.12, FastAPI, SQLAlchemy (Async), Uvicorn, Pydantic v2.
- **Database**: PostgreSQL (with automatic zero-dependency SQLite fallback for instant local run).
- **Edge Firmware**: ESP32-S3 Arduino C++ sketch with FreeRTOS multitasking (`firmware/esp32_gridguard_main.ino`).
- **IoT Broker**: HiveMQ Cloud Broker (`260e034f069c4cb895d24c44549ac094.s1.eu.hivemq.cloud:8883` with TLS).
- **IoT Orchestration**: Node-RED flows (`nodered/flows.json`).
- **Machine Learning**: `scikit-learn` Time-Series Regression for dynamic load forecasting and project-defined Channel Risk Index calculation.
- **AI Advisory**: Google Gemini API via backend proxy with structured telemetry context injection.
- **Biometrics**: Laptop-based facial recognition reset authorization for latched safety trips.

---

## 4. Quick Start Guide

### Prerequisites
- Node.js v18+ (v24 recommended) & npm
- Python 3.10+ (Python 3.12 recommended)

### 1. Launch FastAPI Backend
```bash
# From project root:
backend\venv\Scripts\activate

# Run Uvicorn server:
python -u -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
- API Swagger Documentation: `http://127.0.0.1:8000/docs`
- Live WebSocket Endpoint: `ws://127.0.0.1:8000/ws/live`

### 2. Launch Next.js Frontend
```bash
cd frontend
npm run dev
```
Open `http://localhost:3000` to enter the **GRIDGUARD** dashboard.

---

## 5. Complete Operational SCADA Suite (19 Dedicated Routes)

| # | Route | Title | Description |
|---|---|---|---|
| 1 | `/` | System Overview | Overall PZEM metrics, 4 channel preview cards, Digital Twin preview |
| 2 | `/live` | Live Monitoring | High-frequency telemetry stream, live gauges, relay commanded states |
| 3 | `/digital-twin` | Digital Twin | Animated Single-Line Diagram of AC mains, PZEM, relays, and bulbs |
| 4 | `/faults` | Fault Center | Active faults, forensic archive, acknowledgment, and face reset |
| 5 | `/calibration` | Sensor Calibration | ZMPT101B & ACS712 linear gain/offset, zero-current auto-zero, error % |
| 6 | `/timeline` | Event Timeline | Sub-second chronological demonstration timeline (Section 35) |
| 7 | `/benchmarks` | Latency Matrix | Measured vs Target subsystem timing (<10ms local protection verification) |
| 8 | `/analytics` | Analytics | High-DPI power waveforms, time-range selectors (1h to 30d) |
| 9 | `/load-management`| Load Management | Priority-based automated load shedding with instant reset/restore |
| 10 | `/ai` | AI Intelligence | Advisory Gemini AI assistant with electrical diagnostic context |
| 11 | `/forecasting` | Load Forecasting | Ridge Regression load prediction at 15m, 30m, 1h horizons with MAE bounds |
| 12 | `/maintenance` | Maintenance | Channel duty hours counter, inspection logbook, and service scheduler |
| 13 | `/notifications` | Notification Center | Real-time safety alert center with deduplication and cooldown |
| 14 | `/system-health` | System Health | Watchdog for ESP32, MQTT, Node-RED, Backend, DB, and data freshness |
| 15 | `/settings` | Settings | Protection threshold sliders, hysteresis, persistence, pin placeholders |
| 16 | `/users` | User Management | RBAC user management (Admin, Operator, Viewer) |
| 17 | `/audit-logs` | Audit Logs | Immutable security and operational action ledger |
| 18 | `/demo` | Demo Simulator | One-click scenario injector for exhibitions and SIH presentations |
| 19 | `/login` | Authentication | Industrial SCADA login with instant role presets |

---

## 6. Comprehensive Engineering Documentation Suite

Detailed architectural, mathematical, and procedural specifications are maintained in the [`docs/`](./docs) directory:

- [**SYSTEM_ARCHITECTURE.md**](./docs/SYSTEM_ARCHITECTURE.md): Full end-to-end electrical & supervisory architecture, fail-safe boundaries.
- [**HARDWARE_ARCHITECTURE.md**](./docs/HARDWARE_ARCHITECTURE.md): Component inventory, wiring topology, creepage/isolation, and HAL.
- [**FIRMWARE_ARCHITECTURE.md**](./docs/FIRMWARE_ARCHITECTURE.md): FreeRTOS dual-core allocation, deterministic FSM, persistence, and hysteresis.
- [**MQTT_SPECIFICATION.md**](./docs/MQTT_SPECIFICATION.md): HiveMQ Cloud TLS parameters, topic hierarchy, structured JSON payloads, and LWT.
- [**DATABASE_SCHEMA.md**](./docs/DATABASE_SCHEMA.md): Catalog of all 16 normalized tables, retention policies, and indexing.
- [**API_SPECIFICATION.md**](./docs/API_SPECIFICATION.md): Comprehensive FastAPI REST endpoints catalog with RBAC permissions.
- [**PROTECTION_LOGIC.md**](./docs/PROTECTION_LOGIC.md): Multi-level protection states, mathematical trip equations, and snapshot schema.
- [**FAULT_CLASSIFICATION.md**](./docs/FAULT_CLASSIFICATION.md): Rule-based fault taxonomy vs ML-based anomaly heuristics.
- [**ML_ARCHITECTURE.md**](./docs/ML_ARCHITECTURE.md): Dynamic Ridge Regression forecasting, holdout validation ($MAE = 8.72\text{W}$, $R^2 = 0.998$), and Gemini boundaries.
- [**SECURITY.md**](./docs/SECURITY.md): RBAC matrix, PBKDF2-SHA256 password hashing, TLS MQTT, and biometric face reset.
- [**TEST_PLAN.md**](./docs/TEST_PLAN.md): Formal 30-scenario test matrix, latency benchmark results, and fault injection suite.
- [**DEMO_GUIDE.md**](./docs/DEMO_GUIDE.md): Step-by-step 16-step exhibition demonstration sequence.
- [**CALIBRATION_GUIDE.md**](./docs/CALIBRATION_GUIDE.md): Mathematical linear gain/offset formulas and calibration procedure.

---

## 7. Safety & Technical Verification Audit Matrix

| Audit Item | Code Status | Runtime Status | Hardware Status | Verification Detail |
|---|---|---|---|---|
| **Zero Temperature Invariant** | COMPLETE | VERIFIED | N/A | 0 sensors, 0 ADC channels, 0 DB columns, 0 UI elements. Pure electrical SCADA. |
| **Prototype Load Nomenclature** | COMPLETE | VERIFIED | VERIFIED | 4 bulbs strictly designated as prototype loads emulating transformer channels. |
| **Apparent Power ($VA$) Formulation** | COMPLETE | VERIFIED | N/A | Individual channel $V \times I$ strictly labeled and calculated as Apparent Power ($VA$). |
| **Local Protection Independence** | COMPLETE | VERIFIED | PENDING FLASH | ESP32-S3 Core 1 FreeRTOS loop trips deterministically without network/cloud. |
| **Relay Feedback Distinction** | COMPLETE | VERIFIED | NOT WIRED | SCADA and API explicitly report `COMMANDED: ON • PHYSICAL FEEDBACK: NOT AVAILABLE`. |
| **Staggered Relay Stabilization** | COMPLETE | VERIFIED | PENDING BENCH | Authoritative `MAIN_RELAY_STABILIZATION_MS = 250ms` delay between Main and Aux relays. |
| **Biometric Face Architecture** | COMPLETE | VERIFIED | VERIFIED | 512-D FaceNet512-compatible normalized vector, liveness gate, single-use 60s token. |
| **Database Architecture** | COMPLETE | VERIFIED (SQLite) | BLOCKED (PG Engine) | Production supports PostgreSQL (`asyncpg`); SQLite active as verified local fallback. |
| **HiveMQ Cloud Strict TLS** | COMPLETE | VERIFIED | PENDING HARDWARE | Port 8883 with strict CA verification (`verifyservercert: true`) in Node-RED. |
| **ESP32 Firmware Compilation** | COMPLETE | VERIFIED | PENDING HARDWARE | Compiled with PlatformIO (`firmware.bin` generated, 14.1% RAM, 25.7% Flash). |
| **Advisory AI Isolation** | COMPLETE | VERIFIED | N/A | Gemini operates strictly supervisory; blocked from relay commands or safety bypass. |
| **Automated Test Suite** | COMPLETE | VERIFIED | N/A | 100% pass rate across backend safety suite, TypeScript check, and Next.js build. |

---

## 8. Hardware Bring-Up & Electrical Safety Instructions

### Controlled Bring-Up Sequence:
1. **Flash Firmware**: Connect ESP32-S3 via USB. Open PlatformIO / Arduino IDE and flash `firmware/esp32_gridguard_main.ino`.
2. **Serial Monitor Validation**: Observe 115200 baud serial output for Wi-Fi association and HiveMQ TLS handshake.
3. **Low-Voltage Bench Verification**: Test relay actuation using 5V logic before connecting 230V AC mains.
4. **Isolated Channel Bring-Up**: Connect Channel 1 prototype bulb under qualified electrical supervision. Verify ZMPT101B and ACS712 readings in SCADA.
5. **Channels 2–4 Progressive Commissioning**: Bring up remaining prototype load channels sequentially.

---
*GRIDGUARD — Engineered for Serious Electrical Protection & Real-Time Supervisory Intelligence.*

