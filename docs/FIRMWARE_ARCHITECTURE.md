# GRIDGUARD — Firmware Architecture & Deterministic Protection Engine

## 1. Dual-Core FreeRTOS Task Allocation

The ESP32-S3 N16R8 contains dual 240MHz Xtensa LX7 processor cores. Tasks are strictly pinned to dedicated cores to isolate protection latency from network operations:

```
┌──────────────────────────────────────────────┐  ┌──────────────────────────────────────────────┐
│           CORE 1: PROTECTION DOMAIN          │  │          CORE 0: SUPERVISORY DOMAIN          │
│   (Highest Priority FreeRTOS Tasks)          │  │       (Low Priority Asynchronous Tasks)      │
├──────────────────────────────────────────────┤  ├──────────────────────────────────────────────┤
│ 1. ADC DMA Driver (Continuous 12-bit sample) │  │ 1. Wi-Fi Station & Reconnection Task        │
│ 2. True-RMS Math Engine (Per-cycle compute)  │  │ 2. HiveMQ TLS MQTT Client                    │
│ 3. Deterministic State Machine (6.8ms loop)  │  │ 3. JSON Telemetry Serializer (1.0 Hz)        │
│ 4. Direct GPIO Fast Tripping Output Stage    │  │ 4. MQTT Heartbeat & Watchdog Ping            │
│ 5. Autonomous Local Fault Latch Registry     │  │ 5. Supervisory Command Ingestion             │
└──────────────────────────────────────────────┘  └──────────────────────────────────────────────┘
```

---

## 2. Protection State Machine

The firmware executes a deterministic finite state machine (FSM) evaluated every tick on Core 1:

```
   ┌─────────┐
   │  BOOT   │
   └────┬────┘
        │
        ▼
   ┌─────────────┐     GPIO Conflict / Saturation
   │ SELF_CHECK  ├─────────────────────────────────┐
   └────┬────────┘                                 │
        │ Startup checks PASS                      │
        ▼                                          │
   ┌─────────┐                                     │
   │ NORMAL  │                                     │
   └────┬────┘                                     │
        │ I > warning_current                      │
        ▼                                          │
   ┌─────────┐                                     │
   │ WARNING │                                     │
   └────┬────┘                                     │
        │ I > high_load_current                    │
        ▼                                          │
   ┌───────────┐                                   │
   │ HIGH_LOAD │                                   │
   └────┬──────┘                                   │
        │ I > critical_current                     │
        ▼                                          │
   ┌──────────┐                                    │
   │ CRITICAL │ (Persistence Timer Starts: 1000ms) │
   └────┬─────┘                                    │
        │ Persistence >= 1000ms                    │
        ▼                                          │
   ┌──────────┐                                    │
   │ TRIPPED  │ (Command Main & Aux Relays OPEN)   │
   └────┬─────┘                                    │
        │ Immediate Transition                     │
        ▼                                          │
 ┌────────────────┐                                │
 │ FAULT_LATCHED  │                                │
 └──────┬─────────┘                                │
        │ Reset Request + Face Biometric Verified  │
        ▼                                          │
 ┌────────────────┐                                │
 │  SAFETY CHECK  │                                │
 └──────┬─────────┘                                │
        │ Measured V & I in safe range             │
        ▼                                          │
 ┌────────────────┐                                │
 │ STABILIZATION  │ (2000ms monitoring)            │
 └──────┬─────────┘                                │
        │ Stable nominal load                      │
        ▼                                          ▼
   ┌─────────┐                         ┌───────────────────────┐
   │ NORMAL  │                         │ HARDWARE_CONFIG_ERROR │
   └─────────┘                         └───────────────────────┘
```

---

## 3. Time-Based Fault Persistence & Hysteresis

To eliminate nuisance tripping and relay contact chatter:

### Persistence Criterion
A trip is asserted if and only if the measured electrical parameter exceeds the safety threshold continuously for a defined persistence interval:

$$\text{Trip Condition} = (I_{\text{actual}} > I_{\text{critical}}) \quad \text{AND} \quad (\Delta t \ge t_{\text{persistence}})$$

Default project configuration:
- $I_{\text{critical}} = 2.50\text{ A}$
- $t_{\text{persistence}} = 1000\text{ ms}$

### Hysteresis Formulation
To prevent rapid oscillation when a load fluctuates near threshold boundaries, recovery requires the parameter to drop below the hysteresis threshold:

$$I_{\text{recovery}} = I_{\text{trip}} \times \left(1 - \frac{\text{hysteresis\_pct}}{100}\right)$$

With $5\%$ hysteresis:
$$I_{\text{recovery}} = 2.50 \times 0.95 = 2.375\text{ A}$$

---

## 4. Decoupled Signal Paths
- **Protection Signal**: Raw, un-smoothed RMS samples calculated directly from the ADC buffer for sub-10ms trip response.
- **Display Signal**: Exponential Moving Average (EMA, $\alpha = 0.25$) for smooth SCADA telemetry visualization.
- **Rule**: Display smoothing filters are **never placed in series with the protection evaluation path**.
