# GRIDGUARD — Protection Logic & State Machine Specification

## 1. Multi-Level Protection Hierarchy (Section 10)

The GRIDGUARD protection engine classifies electrical conditions into six formal levels:

| Level | State | Trigger Condition | Visual Status | Relays | Reset Action |
|---|---|---|---|---|---|
| **Level 0** | `NORMAL` | Nominal voltage & current ($I \le 2.00\text{A}$, $210\text{V} \le V \le 245\text{V}$) | Green pulse | CLOSED | None required |
| **Level 1** | `WARNING` | Approaching thermal limits ($I > 2.20\text{A}$) | Amber steady | CLOSED | Auto-clears on recovery |
| **Level 2** | `HIGH LOAD` | Continuous heavy load ($I > 2.40\text{A}$) | Yellow flashing | CLOSED | Auto-clears on recovery |
| **Level 3** | `CRITICAL` | Fault threshold crossed ($I > 2.50\text{A}$) | Red flashing | CLOSED | Persistence timer counting ($1000\text{ms}$) |
| **Level 4** | `TRIPPED` | Persistence satisfied ($\Delta t \ge 1000\text{ms}$) | Red solid | **OPEN (Tripped)** | Immediate transition to Latched |
| **Level 5** | `FAULT LATCHED` | Safety trip confirmed | Rose pulsating | **OPEN (Locked)** | **Requires Biometric Face Authorization** |

---

## 2. Structured Protection Decision Object (Section 10 & 18)

When an evaluation occurs, the protection engine generates a deterministic decision snapshot:

```json
{
  "channel": 2,
  "timestamp": "2026-09-18T10:32:15.012Z",
  "state": "TRIPPED",
  "reason": "OVERCURRENT",
  "measured_current": 3.45,
  "threshold_current": 2.50,
  "persistence_duration_ms": 1040,
  "measured_voltage": 228.4,
  "apparent_power_va": 788.0,
  "system_active_power_w": 1350.2,
  "system_frequency_hz": 50.02,
  "power_factor": 0.92,
  "action": "TRIP_RELAYS",
  "relays_commanded": {
    "main_relay": "OPEN",
    "aux_relay": "OPEN",
    "physical_feedback": "NOT_AVAILABLE"
  },
  "latch_status": "FAULT_LATCHED",
  "authorization_required": "FACE_RECOGNITION"
}
```

---

## 3. Mathematical Trip & Recovery Formulations

### Overcurrent Protection
$$I_{\text{RMS}} > I_{\text{critical}} \quad \text{for} \quad \Delta t \ge t_{\text{persistence}} \implies \text{TRIP}$$
$$I_{\text{recovery}} = I_{\text{critical}} \times (1 - H_{\text{current}})$$
Where default $I_{\text{critical}} = 2.50\text{ A}$, $t_{\text{persistence}} = 1.0\text{ s}$, $H_{\text{current}} = 0.05$ ($5\%$).

### Overvoltage Protection
$$V_{\text{RMS}} > V_{\text{max}} \quad (V_{\text{max}} = 250.0\text{ V}) \quad \text{for} \quad \Delta t \ge 500\text{ ms} \implies \text{TRIP}$$
$$V_{\text{recovery}} = V_{\text{max}} - 5.0\text{ V} = 245.0\text{ V}$$

### Undervoltage Protection
$$V_{\text{RMS}} < V_{\text{min}} \quad (V_{\text{min}} = 190.0\text{ V}) \quad \text{for} \quad \Delta t \ge 1500\text{ ms} \implies \text{TRIP}$$
$$V_{\text{recovery}} = V_{\text{min}} + 5.0\text{ V} = 195.0\text{ V}$$

---

## 4. Relay Sequencing & Safe Re-Closure (Section 12 & 25)

When unlatching a tripped channel after biometric authorization:
1. **Pre-Closure Verification**: Sensor health confirmed `GOOD`, line voltage verified nominal ($200\text{V} \le V \le 250\text{V}$).
2. **Sequential Relay Closure**: Main Relay energized first, followed by Auxiliary Relay after a $100\text{ms}$ inter-stage delay.
3. **Stabilization Monitoring**: System enters `STABILIZATION` for $2000\text{ms}$. If inrush current remains above critical threshold beyond $1000\text{ms}$, the engine immediately re-trips and re-latches the channel.
