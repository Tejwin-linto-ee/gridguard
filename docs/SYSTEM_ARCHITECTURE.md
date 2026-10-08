# GRIDGUARD — System Architecture Specification

## 1. Executive Summary & Philosophy
**GRIDGUARD** is a real-time, fault-tolerant, supervisory monitoring and protection platform designed for **Smart Transformer Protection and Assistive Load Control**.

The system establishes an absolute separation between the **Local Hardware Protection Domain** and the **Supervisory Domain**.

```
LOCAL HARDWARE PROTECTION (ESP32-S3 FreeRTOS, Sensors, Relays)
        >
NETWORK COMMUNICATION (Authenticated MQTT via TLS HiveMQ Cloud)
        >
SUPERVISORY ORCHESTRATION (Node-RED Integration Pipeline)
        >
BACKEND CORE (FastAPI, Asynchronous Telemetry, Audit Logs)
        >
PERSISTENT STORAGE (PostgreSQL / SQLite Database)
        >
DASHBOARD & SCADA (Next.js, Live WebSockets, Canvas Digital Twin)
        >
ANALYTICS & ADVISORY AI (Dynamic Regression ML, Gemini Supervisory Assistant)
```

---

## 2. End-to-End Conceptual Flow Diagram

```
                    ┌─────────────────────────┐
                    │     AC MAINS SOURCE     │
                    │      (230V / 50Hz)      │
                    └────────────┬────────────┘
                                 │
                             PZEM-004T
                     (V, I_total, P, E, f, PF)
                                 │
                          Common Live Bus
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │                         │                         │
      CH1                       CH2                     CH3 ... CH4
       │                         │
   ZMPT101B                  ZMPT101B
       │                         │
   Main Relay                Main Relay
       │                         │
   Aux Relay                 Aux Relay
       │                         │
    ACS712                    ACS712
       │                         │
 Prototype Load 1          Prototype Load 2
  (Incandescent)            (Incandescent)
       │                         │
       └────────────── Common Neutral Conductor ───────────┘

                           ESP32-S3
             (Core 1 Deterministic Protection Loop <10ms)
                                 │
                            MQTT / TLS
                                 │
                           HiveMQ Cloud
                                 │
                             Node-RED
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
          PostgreSQL          FastAPI           WebSocket
        (Telemetry DB)     (REST & Audit)     (Multiplexing)
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                              Next.js
                      (GRIDGUARD SCADA Suite)
                                 │
             ┌───────────────────┼───────────────────┐
             │                   │                   │
         ML Dynamic            Gemini            Biometric
         Forecasting          Advisory           Face Auth
             │                   │                   │
             └───────────────────┴───────────────────┘
                                 │
                        SUPERVISORY DOMAIN
```

---

## 3. Strict Prototype Terminology
- **No Physical Transformers**: The physical setup uses four incandescent/resistive lamps as **Prototype Load Channels** emulating four feeder branches.
- **Power Terminology**:
  - **PZEM-004T**: System Active Power ($W$), Energy ($Wh$/$kWh$), Frequency ($Hz$), Power Factor ($PF$).
  - **Channel Sensing (ZMPT101B × ACS712)**: $V \times I$ is strictly designated as **Apparent Power ($VA$)**.
- **Zero Temperature Sensors**: The system contains 0 temperature sensors, 0 ADC channels, 0 temperature DB columns, and 0 temperature UI widgets.

---

## 4. Hardware Independence & Fail-Safe Invariants
1. **Network Failure**: If Wi-Fi or MQTT disconnects, the ESP32-S3 Core 1 protection loop continues autonomously, evaluating overcurrent and overvoltage every 6.8ms.
2. **Server Failure**: If Node-RED, FastAPI, or PostgreSQL crashes, relays trip and latch locally when safety limits are violated.
3. **Frontend Failure**: Operator UI disconnect does not compromise protection or fault latching.
4. **Advisory AI Isolation**: Gemini AI operates strictly in supervisory read-only mode and is physically blocked from executing hardware commands, altering safety limits, or unlatching relays.
