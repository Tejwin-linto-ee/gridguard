# GRIDGUARD — FastAPI Core REST API Specification

Base URL: `http://127.0.0.1:8000/api`

## 1. Authentication & RBAC

| Method | Endpoint | Access Role | Description |
|---|---|---|---|
| `POST` | `/auth/login` | Public | Authenticates user via PBKDF2-SHA256, issues JWT Bearer token |
| `GET` | `/auth/me` | Authenticated | Returns current user profile, assigned role, and permissions |

---

## 2. Core Telemetry & Channel Monitoring

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/system/status` | Public | Returns PZEM-004T bulk telemetry (V, I_total, P, E, f, PF, Data Source) |
| `POST` | `/system/status` | Ingestion | Ingests bulk telemetry packet from Node-RED or hardware |
| `GET` | `/channels` | Public | Returns live array of all 4 prototype load channels |
| `POST` | `/channels` | Ingestion | Ingests channel measurement packet (ZMPT101B, ACS712, Relays) |
| `GET` | `/channels/{id}` | Public | Returns deep telemetry, operating hours, trip counts, and status for Channel {id} |
| `GET` | `/channels/{id}/measurements` | Public | Returns historical time-series measurements for charting |

---

## 3. Relays & Biometric Reset Authorization

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `POST` | `/relays/command` | OPERATOR, ADMIN | Commands manual relay toggle (blocked if channel is FAULT LATCHED) |
| `POST` | `/relays/reset-face-auth` | Public / Operator | Verifies biometric face token ($>75\%$ confidence), checks safety, and unlatches relays |

---

## 4. Sensor Calibration (Section 4 & 5)

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/calibration` | Public | Returns calibration parameters, raw ADC values, errors, and quality for all channels |
| `POST` | `/calibration` | ADMIN | Updates linear scale, offset, and reference parameters with audit log entry |
| `POST` | `/calibration/zero-current`| OPERATOR, ADMIN | Auto-calibrates ACS712 zero-current quiescent mid-scale offset |
| `POST` | `/calibration/reset` | ADMIN | Restores factory default linear calibration coefficients |

---

## 5. Faults, Timeline & Load Management

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/faults` | Public | Returns list of historical and active fault events |
| `GET` | `/faults/active` | Public | Returns currently tripped/latched channels requiring resolution |
| `POST` | `/faults/{id}/acknowledge` | OPERATOR, ADMIN | Acknowledges an active fault with operator notes |
| `POST` | `/faults/{id}/resolve` | OPERATOR, ADMIN | Marks fault as resolved after post-incident verification |
| `GET` | `/events/timeline` | Public | Chronological event stream with sub-second timestamps (Section 35) |
| `GET` | `/load-management/config` | Public | Returns system demand limit (W) and channel priority rankings |
| `POST` | `/load-management/config`| ADMIN | Updates demand threshold and channel shedding priorities |
| `POST` | `/load-management/reset` | OPERATOR, ADMIN | Restores all shed channels and deactivates load-shedding state |
| `GET` | `/load-management/events`| Public | Returns log of priority load-shedding actions |

---

## 6. Benchmarks, AI & System Health

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/benchmarks/latency` | Public | Measured vs Target Latency Matrix (<10ms local protection verification) |
| `GET` | `/predictions` | Public | Ridge Regression dynamic load forecast (15m, 30m, 60m horizons) |
| `GET` | `/risk` | Public | Explainable Project-defined Channel Risk Index (0–100) |
| `POST` | `/ai/analyze` | Public | Advisory Gemini AI analysis of telemetry; strictly non-executable |
| `GET` | `/system-health` | Public | Health status of all 6 architecture tiers, watchdog uptime, data freshness |
| `GET` | `/audit-logs` | ADMIN, OPERATOR | Immutable audit ledger of all operator and system actions |
| `POST` | `/demo/scenario` | Public | Simulator trigger: NORMAL, OVERLOAD, OVERCURRENT, LOAD_SHEDDING, etc. |
