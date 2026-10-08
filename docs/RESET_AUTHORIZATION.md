# GRIDGUARD Fault Reset Authorization & Pre-Closure Safety Specification

## 1. Overview & Operational Hazard Mitigation

In electrical distribution, re-energizing a latched fault without verifying circuit clearance is hazardous. Attempting to close a circuit breaker into a bolted short-circuit or continuous overload risks catastrophic equipment damage or fire.

Therefore, **biometric verification alone is NEVER permitted to close the circuit relay**.

The reset workflow consists of two decoupled gates:
1. **Gate 1: Biometric Operator Authorization** (Proves human identity and operational authority).
2. **Gate 2: Pre-Closure Electrical Safety Validation** (Proves the electrical circuit is safe for re-energization).

---

## 2. The Two-Gate Reset Workflow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        GATE 1: BIOMETRIC AUTHORIZATION                 │
│                                                                        │
│   Operator presents face in browser camera                             │
│   - Single face detected & quality passed                              │
│   - Multi-frame liveness verified (score >= 0.75)                      │
│   - FaceNet512 embedding matched to authorized operator (score >= 0.78)│
│   - RBAC clearance confirmed (OPERATOR or ADMIN role)                  │
│                                                                        │
│   RESULT: reset_authorization_token issued (60s TTL)                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               GATE 2: PRE-CLOSURE ELECTRICAL SAFETY CHECK              │
│                                                                        │
│   Backend queries real-time channel telemetry:                         │
│   ├── Is active current below trip threshold? (I_meas < 2.50 A)        │
│   ├── Is voltage within nominal operating envelope? (200V <= V <= 250V)│
│   ├── Is fault condition physically cleared?                           │
│   └── Is protection engine ready for re-closure?                       │
│                                                                        │
│   If any check fails:                                                  │
│   └── STATUS: "IDENTITY AUTHORIZED, BUT RESET BLOCKED"                 │
│       Relay remains strictly OPEN and latched.                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Safe
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                LOCAL HARDWARE SAFETY CONFIRMATION (ESP32)              │
│                                                                        │
│   Backend sends MQTT command with token hash:                          │
│   `smarttransformer/commands`                                          │
│   - ESP32-S3 receives command on Core 1                                │
│   - Reads local ACS712 ADC pins to confirm zero continuous fault       │
│   - Closes Main Relay (GPIO18)                                         │
│   - Pauses 250ms for inrush current stabilization                      │
│   - Closes Aux Assistive Load Relay (GPIO19)                           │
│   - Returns status = "NORMAL" to SCADA over MQTT                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Channel-Specific & Fault-Specific Binding

Accidental unlatching of the wrong electrical branch is prevented through strict token binding:
- When Channel 2 trips due to an `OVERCURRENT` event, the reset session binds to `channel_id = 2` and the specific `fault_id` UUID.
- If an operator attempts to present the token to unlatch Channel 1 or Channel 3, the backend rejects the execution with `HTTP 400 CHANNEL_MISMATCH`.
- If a new fault occurs while an authorization token is in flight, the old `fault_id` becomes obsolete and the token is automatically invalidated.
