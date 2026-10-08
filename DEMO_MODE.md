# GRIDGUARD — DEMONSTRATION MODE & ISOLATION CONTRACT

---

## 1. Absolute Isolation Invariant
Demonstration Mode (`/demo`) provides an exhibition simulator allowing judges, engineers, and operators to observe protection trips, facial verification, and staggered relay restoration without physical hardware.

### Non-Negotiable Isolation Constraints:
- **NO MQTT COMMANDS**: Demo mode actions NEVER publish to MQTT topics (`smarttransformer/commands` or any other topic).
- **NO PHYSICAL RELAY OPERATION**: Demo mode NEVER actuates physical GPIO outputs or relay coils on the ESP32-S3.
- **NO TELEMETRY OVERWRITING**: Demo values are stored in isolated simulator memory (`current_demo_state`) and NEVER overwrite production database records in `system_measurements` or `channel_measurements`.
- **NO AUDIT CONTAMINATION**: Demo trips are strictly tagged as `DEMO_EVENT` and excluded from production SCADA health metrics and live fault history.

---

## 2. Simulated Scenarios
Operators can trigger controlled scenarios:
1. **`NORMAL`**: All 4 channels energized ($230\text{V}$, nominal currents, both Main and Aux relays closed).
2. **`OVERCURRENT`**: Channel current ramps to $3.45\text{A}$ ($>2.50\text{A}$ threshold), triggering simulated relay trip into `FAULT LATCHED`.
3. **`OVERVOLTAGE`**: Voltage ramps to $256.0\text{V}$, triggering simulated overvoltage latch.
4. **`UNDERVOLTAGE`**: Voltage drops to $182.0\text{V}$, triggering simulated undervoltage latch.
5. **`LOAD_SHEDDING`**: Total system demand crosses $1200\text{W}$, shedding lowest priority channels.

---

## 3. Mandatory UI Visual Indicators
Every screen in `/demo` displays prominent banners:
```
DEMONSTRATION MODE
SIMULATED DATA — NOT LIVE HARDWARE TELEMETRY
```
All event logs, charts, and single-line diagrams display `DEMO EVENT` badges to prevent confusion with live hardware telemetry.
