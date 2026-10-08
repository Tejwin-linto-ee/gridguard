# GRIDGUARD — Fault Classification Specification

## 1. Rule-Based vs ML-Based Distinction (Section 19)

To maintain absolute technical credibility, GRIDGUARD strictly separates **deterministic rule-based fault detection** from **probabilistic machine learning anomaly analysis**:

| Classification Domain | Engine | Response Time | Determinism | Safety Authority |
|---|---|---|---|---|
| **Rule-Based Protection** | ESP32-S3 Core 1 FreeRTOS FSM | $< 10\text{ ms}$ | 100% Deterministic | **Primary Safety Authority** (Direct Relay Trip) |
| **ML-Based Analytics** | Scikit-Learn Regression & Anomaly Core | $\sim 50\text{ ms}$ | Probabilistic Heuristic | **Advisory Only** (No Direct Trip Capability) |

---

## 2. Rule-Based Fault Taxonomy

### 1. OVERCURRENT (`OVERCURRENT`)
- **Detector**: In-line ACS712 current transducer RMS calculation.
- **Criteria**: $I_{\text{actual}} > 2.50\text{ A}$ for $\Delta t \ge 1000\text{ ms}$.
- **Response**: Immediate de-energization of Main and Auxiliary relays; transition to `FAULT LATCHED`.

### 2. OVERVOLTAGE (`OVERVOLTAGE`)
- **Detector**: ZMPT101B voltage sensor RMS calculation.
- **Criteria**: $V_{\text{actual}} > 250.0\text{ V}$ for $\Delta t \ge 500\text{ ms}$.
- **Response**: Trip affected channel or entire bus; trigger overvoltage alarm.

### 3. UNDERVOLTAGE (`UNDERVOLTAGE`)
- **Detector**: ZMPT101B voltage sensor RMS calculation.
- **Criteria**: $V_{\text{actual}} < 190.0\text{ V}$ for $\Delta t \ge 1500\text{ ms}$.
- **Response**: Protect load equipment from brownout; trip relays if persistent.

### 4. OVERLOAD (`OVERLOAD`)
- **Detector**: Calculated branch Apparent Power ($VA = V \times I$).
- **Criteria**: $S_{\text{apparent}} > 600.0\text{ VA}$ continuously.
- **Response**: Enters `WARNING` / `HIGH LOAD`; triggers priority load-shedding evaluation.

### 5. SENSOR FAULT (`SENSOR_FAULT`)
- **Detector**: Sensor plausibility monitoring engine (`calibration_service`).
- **Criteria**: ADC saturation ($\ge 4090$ or $\le 5$), impossible values ($V > 290\text{V}$, $I > 15\text{A}$), or step jump $> 65\text{V}$.
- **Response**: Marks telemetry as `BAD` / `DATA INVALID`; blocks re-closure until sensor is inspected.

### 6. COMMUNICATION FAULT (`COMMUNICATION_FAULT`)
- **Detector**: Supervisory telemetry watchdog.
- **Criteria**: Packet age $> 60\text{ s}$ (`STALE`) or $> 300\text{ s}$ (`OFFLINE`).
- **Response**: SCADA alerts operator; local edge protection remains fully active.

### 7. SYSTEM FAULT (`SYSTEM_FAULT`)
- **Detector**: PZEM-004T bulk system meter.
- **Criteria**: Grid frequency deviation ($f < 47.5\text{ Hz}$ or $f > 52.5\text{ Hz}$) or bulk overcurrent.
- **Response**: System-wide protection alert.

---

## 3. Project-Defined Channel Risk Index (Section 20)
Range: $0 \dots 100$

$$\text{Risk Index} = w_I \cdot S_I + w_V \cdot S_V + w_{\text{trip}} \cdot S_{\text{trip}} + w_{\text{hours}} \cdot S_{\text{hours}}$$

- **Current Stress ($S_I$, 40%)**: Ratio of operating current to nominal threshold.
- **Voltage Instability ($S_V$, 25%)**: Deviation from $230\text{V}$ nominal.
- **Trip Frequency ($S_{\text{trip}}$, 25%)**: Cumulative trips recorded in last 24 hours.
- **Operating Duty ($S_{\text{hours}}$, 10%)**: Accumulated operating hours without service.
- **Label**: Strictly designated as *"Project-defined Channel Risk Index"*; never claimed to be an official IEEE/IEC transformer health standard.
