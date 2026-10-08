# GRIDGUARD — PostgreSQL / SQLite Database Schema

## 1. Schema Architecture & Zero-Temperature Compliance
The storage engine uses SQLAlchemy Async ORM targeting PostgreSQL for production deployments and SQLite for local development.

> **Absolute Hard Constraint**:
> There are **ZERO temperature columns** in any table. Field names, constraints, and relationships are purely electrical, operational, or forensic.

---

## 2. Table Catalog (16 Normalized Tables)

### A. Core Telemetry & Measurements
1. **`system_measurements`**: Time-indexed bulk measurements from PZEM-004T.
   - `id` (PK), `timestamp` (Indexed), `device_id`, `voltage`, `current`, `power` (Active W), `energy` (kWh), `frequency` (Hz), `power_factor`, `data_source`.
2. **`channel_measurements`**: Time-indexed branch readings from ZMPT101B and ACS712.
   - `id` (PK), `timestamp` (Indexed), `channel` (1..4, Indexed), `voltage`, `current`, `apparent_power` (VA strictly), `relay_state`, `status`, `data_source`.

### B. Protection & Forensics
3. **`fault_events`**: Immutable forensic fault snapshots captured at trip time.
   - `id` (PK), `fault_id` (Unique, Indexed), `channel` (Indexed), `fault_type` (OVERCURRENT, OVERVOLTAGE, etc.), `severity`, `measured_value`, `threshold`, `start_timestamp` (Indexed), `end_timestamp`, `duration_sec`, `relay_state`, `resolution`, `acknowledged`, `acknowledged_by`, `acknowledged_at`, `resolved_by`, `resolved_at`, `notes`.
4. **`relay_events`**: Record of commanded relay state changes.
   - `id` (PK), `timestamp` (Indexed), `channel`, `relay_type` (MAIN, AUXILIARY), `commanded_state` (CLOSED, OPEN), `reason`, `operator_id`, `feedback_available` (False).
5. **`load_shedding_events`**: Log of priority-based load shedding triggers.
   - `id` (PK), `timestamp` (Indexed), `channel`, `priority_level`, `reason`, `system_demand_w`, `configured_limit_w`, `action` (SHED, RESTORE), `status`.

### C. Sensor Calibration & Configuration
6. **`calibration_configs`**: Linear calibration coefficients per channel (Section 4).
   - `id` (PK), `channel` (Unique, 1..4), `voltage_scale`, `voltage_offset`, `current_scale`, `current_offset`, `zero_current_raw`, `reference_voltage`, `reference_current`, `status`, `calibrated_by`, `calibration_version`, `last_calibrated`.

### D. System Operations, Security & Audit
7. **`users`**: Operator and administrator credentials.
   - `id` (PK), `username` (Unique), `email`, `hashed_password` (PBKDF2-SHA256), `role` (ADMIN, OPERATOR, VIEWER), `is_active`, `created_at`.
8. **`authentication_events`**: Biometric face and password authentication log.
   - `id` (PK), `timestamp` (Indexed), `event_type` (LOGIN, FACE_RESET_AUTH), `username`, `role`, `auth_method`, `ip_address`, `success`, `notes`.
9. **`system_events`**: Immutable system and audit trail (Section 27).
   - `id` (PK), `timestamp` (Indexed), `event_type`, `component`, `description`, `severity`.
10. **`maintenance_records`**: Operational hours, service tracking (Section 30).
    - `id` (PK), `channel`, `date` (Indexed), `maintenance_type`, `description`, `technician`, `action_taken`, `notes`, `operating_hours`, `fault_count`, `trip_count`, `status`, `next_due_date`.
11. **`notifications`**: Dispatch and acknowledgement log (Section 29).
    - `id` (PK), `title`, `description`, `severity`, `channel`, `category`, `timestamp` (Indexed), `is_read`, `email_dispatched`.
12. **`devices`**: Node inventory and firmware versions.
    - `id` (PK), `device_id` (Unique), `name`, `hardware_type`, `firmware_version`, `status`, `created_at`, `last_seen`.
13. **`device_heartbeats`**: Watchdog and RSSI logging (Section 46).
    - `id` (PK), `timestamp` (Indexed), `device_id`, `uptime_sec`, `wifi_rssi`, `heap_free`, `mqtt_connected`.

### E. Analytics & Machine Learning
14. **`risk_scores`**: Historical Channel Risk Index logs (Section 20).
    - `id` (PK), `timestamp` (Indexed), `channel`, `score` (0..100), `trend`, `contributing_factors`, `model_version`.
15. **`ml_predictions`**: Historical load forecasting results (Section 23).
    - `id` (PK), `timestamp` (Indexed), `forecast_horizon_min` (15, 30, 60), `predicted_load_w`, `confidence_interval_pct`, `model_name`, `evaluation_mae_w`.
16. **`ai_analysis`**: Advisory Gemini AI interaction records (Section 24).
    - `id` (PK), `timestamp` (Indexed), `prompt_type`, `user_query`, `ai_response`, `advisory_notes`, `model_used`.

---

## 3. Indexing & Retention Strategy
- **Indexes**: Composite indexes on `(channel, timestamp)` and `(severity, timestamp)` optimize time-series queries.
- **Data Retention**: High-frequency 1 Hz telemetry is downsampled to hourly averages after 30 days. **Forensic fault snapshots and audit logs are retained permanently**.
