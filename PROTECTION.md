# GRIDGUARD — DETERMINISTIC MULTI-LEVEL PROTECTION SYSTEM

---

## 1. Local Edge Authority Principle
The **ESP32-S3 microcontroller is the ultimate and final hardware safety authority**.
- Safety protection runs inside a high-priority FreeRTOS task on Core 1 (`TaskProtectionLoop`) with a deterministic execution interval of $10\text{ms}$.
- Safety decisions are executed entirely from local ADC sampling of ZMPT101B and ACS712 sensors.
- Under NO circumstances can external network services (FastAPI, Next.js, Node-RED, or Gemini AI) override or bypass local hardware trip safety limits.

---

## 2. Multi-Level Protection Stages

```
[ NORMAL ]
    │
    ▼ (Load approaching capacity: Current > 2.0A or Power > 500VA)
[ WARNING / HIGH LOAD ]
    │
    ▼ (Threshold exceeded continuously for persistence duration: 1000ms)
[ PROTECTION TRIP ]
    │
    ▼ (Hardware relays open in < 10ms: Main Relay OFF, Aux Relay OFF)
[ FAULT LATCHED ]
    │
    ▼ (Manual reclosure blocked until Biometric Authorization + Safety Check)
[ RESET SEQUENCE (Main ON ➔ Stabilization ➔ Aux ON) ]
    │
    ▼ (Post-closure telemetry verification)
[ NORMAL ]
```

---

## 3. Authoritative Protection Thresholds

| Fault Condition | Sensing Device | Trigger Threshold | Persistence | Trip Action |
|:---|:---|:---|:---|:---|
| **Overcurrent (Instantaneous)** | ACS712 | $> 2.50\text{ A RMS}$ | $1000\text{ ms}$ | Immediate Main + Aux Relay Open, Fault Latched |
| **Overload (Channel)** | ZMPT101B + ACS712 | $> 600.0\text{ VA}$ | $1000\text{ ms}$ | Immediate Main + Aux Relay Open, Fault Latched |
| **Overvoltage** | ZMPT101B | $> 250.0\text{ V RMS}$ | $1000\text{ ms}$ | Immediate Main + Aux Relay Open, Fault Latched |
| **Undervoltage** | ZMPT101B | $< 190.0\text{ V RMS}$ | $1000\text{ ms}$ | Immediate Main + Aux Relay Open, Fault Latched |
| **Frequency Anomaly** | PZEM-004T | $< 47.5\text{ Hz}$ or $> 52.5\text{ Hz}$ | $2000\text{ ms}$ | Warning Alert & Load Shedding Trigger |
| **System Demand Ceiling** | PZEM-004T | $> 1200.0\text{ W}$ | $3000\text{ ms}$ | Priority-Based Load Shedding (Lowest Priority Shed First) |

---

## 4. Relay Management: Paired Operation
Each channel comprises two series-redundant relays:
- **Main Relay**: Primary isolation contactor.
- **Auxiliary Relay**: Assistive load switching contactor.

### Restoration Invariant:
- Operators reset **Prototype Load Channels**, NOT individual relays.
- During reset, the firmware executes a staggered reclosure:
  1. Main Relay is energized (Auxiliary remains open to buffer inrush).
  2. Stabilization delay of $250\text{ms}$ elapses.
  3. Auxiliary Relay is energized.
  4. Channel status is restored to `NORMAL` only after post-closure telemetry confirms safe electrical stability.
