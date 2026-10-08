# GRIDGUARD — DATABASE SPECIFICATION & DATA MODEL AUDIT

---

## 1. Engine & Configuration
- **Production Target Database**: PostgreSQL (`postgresql+asyncpg`)
- **Connection Configuration**: Controlled via `DATABASE_URL` environment variable:
  ```bash
  DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/gridguard
  ```
- **Local Fallback**: For instant local zero-dependency verification, `session.py` safely connects via `sqlite+aiosqlite:///./gridguard.db`.
- **Zero Temperature Invariant**: Audited across all tables — **ZERO temperature columns exist**.

---

## 2. Entity Relational Models

| Table Name | Primary Entity | Telemetry Nullability | Description |
|:---|:---|:---|:---|
| `devices` | Device registration | N/A | Hardware controllers (`ESP32-S3`), status, and last seen |
| `device_heartbeats` | Controller heartbeat | Nullable | Periodic ping telemetry, Wi-Fi RSSI, and uptime |
| `system_measurements` | PZEM-004T time-series | **Nullable** | Voltage, Current, Active Power (W), Energy (kWh), Frequency (Hz), PF |
| `channel_measurements` | ZMPT/ACS time-series | **Nullable** | Channel (1-4), Voltage (V), Current (A), Apparent Power (VA), Relays |
| `fault_events` | Operational faults | N/A | Channel, fault type, severity, start/resolved timestamps, notes |
| `protection_events` | Safety trip history | N/A | Triggering sensor, threshold, trip duration, action taken |
| `load_shedding_events` | Demand shedding logs | N/A | Shed channels, demand ceiling, restored timestamps |
| `load_shedding_configs` | Dynamic policy limits | N/A | Global demand limit (W), per-channel priority tiers |
| `forecast_logs` | Load forecasting records | Nullable | 15m/30m/60m projected demand, MAE error, uncertainty envelope |
| `channel_risk_logs` | Risk evaluation history | Nullable | Channel risk index score (0-100), trend, stress factors |
| `maintenance_records` | Asset maintenance | N/A | Duty cycles, contact inspection, scheduled dates, notes |
| `notifications` | System alerts | N/A | Severity, dispatch status, email notification audit |
| `audit_logs` | Forensic audit log | N/A | User, role, action, target, result, IP address |
| `users` | Operator credentials | N/A | Username, hashed password, role (`ADMIN`, `OPERATOR`) |
| `biometric_users` | Enrolled face profiles | N/A | User ID, display name, department, role, enrollment status |
| `biometric_enrollments` | 512-D Face Embeddings | N/A | Normalized 512-dimensional vector, sample quality score |
| `biometric_verification_attempts` | Auth access attempts | N/A | Verification confidence, match score, liveness score, decision |
| `reset_requests` | Reset sessions | N/A | Request ID, nonce, primary channel, bound channel IDs, expiry |
| `reset_authorizations` | Cryptographic tokens | N/A | Token hash, bound user, single-use burn status, timestamps |

---

## 3. Data Integrity & Nullability Rules
1. **Zero Synthetic Initialization**: The database is never seeded with fake telemetry rows (e.g. 230V, 0A, 50Hz).
2. **Cold-Start Integrity**: When no live physical telemetry has arrived, all electrical measurement columns evaluate to `NULL`.
3. **Data Source Tracking**: Every telemetry row stores `data_source = "LIVE MQTT"` for genuine hardware packets. Demo scenarios never insert into production telemetry tables.
