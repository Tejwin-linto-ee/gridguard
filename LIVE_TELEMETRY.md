# GRIDGUARD — LIVE TELEMETRY & ANTI-FABRICATION CONTRACT

---

## 1. Absolute Rule: Live Mode Must Never Fabricate Data
Under strict industrial SCADA regulations, fabricating electrical measurements is hazardous and forbidden.
When no live telemetry has been received from the physical hardware:
- **FORBIDDEN FALLBACKS**:
  - `230` or `230.0`
  - `0` or `0.0` (as fabricated electrical state)
  - `50` or `50.0`
  - `NORMAL` (as electrical health state when unmeasured)
  - Synthetic sine waves (`Math.sin(...)`)
  - Random number generation or demo jitter
- **REQUIRED HONEST STATE**:
  - All metrics must internally remain `null`.
  - The UI displays `"---"` for null numeric fields.
  - Overall status displays `"WAITING FOR LIVE MQTT TELEMETRY"`.
  - Risk indices display `"RISK UNAVAILABLE — INSUFFICIENT LIVE DATA"`.
  - Dynamic forecasting displays `"FORECAST UNAVAILABLE — INSUFFICIENT LIVE DATA"`.

---

## 2. Essential State Separations
The platform enforces clear semantic separation between connection status and data availability:

$$\text{DEVICE ONLINE} \neq \text{ELECTRICAL TELEMETRY AVAILABLE}$$
$$\text{WEBSOCKET CONNECTED} \neq \text{LIVE TELEMETRY AVAILABLE}$$
$$\text{REST API REACHABLE} \neq \text{LIVE TELEMETRY AVAILABLE}$$

An ESP32-S3 can be connected to Wi-Fi and MQTT reporting `ONLINE` while its PZEM-004T or ZMPT101B sensors are unpowered or disconnected. Under these conditions, the dashboard displays:
- **ESP32 Status**: `ONLINE`
- **MQTT Broker**: `CONNECTED`
- **Electrical Metrics**: `---` (Waiting for live telemetry)

---

## 3. Freshness & Stale Data Indicator
The frontend measures packet age dynamically:
- **Fresh Live Data**: `Updated < 3 seconds ago` (`LIVE MQTT` pill with green pulse).
- **Stale Data Warning**: If packet age exceeds 15 seconds without a new reading, the status shifts to `STALE LIVE DATA (Last update X seconds ago)`.
- **Zero Loss of Null Semantics**: Stale data retains its last known values or transitions to `---` after watchdog timeout (30 seconds). Missing values are never converted to 0.
