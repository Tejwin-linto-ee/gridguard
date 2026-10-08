import datetime
from sqlalchemy import (
    Column, Integer, Float, String, Boolean, DateTime, Text, ForeignKey, Index
)
from backend.app.db.session import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="OPERATOR", nullable=False) # ADMIN, OPERATOR, VIEWER
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Device(Base):
    __tablename__ = "devices"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    device_id = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), default="ESP32-S3 Protection Controller")
    hardware_type = Column(String(50), default="ESP32-S3 N16R8")
    device_mode = Column(String(30), default="SIMULATOR") # SIMULATOR, REAL_HARDWARE
    firmware_version = Column(String(20), default="1.0.0")
    status = Column(String(20), default="ONLINE") # ONLINE, DEGRADED, OFFLINE
    last_seen = Column(DateTime, default=datetime.datetime.utcnow)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class SystemMeasurement(Base):
    """PZEM-004T V3.0 Overall System Electrical Measurements. STRICTLY ZERO TEMPERATURE."""
    __tablename__ = "system_measurements"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    voltage = Column(Float, nullable=True)        # Volts (V)
    current = Column(Float, nullable=True)        # Amperes (A)
    power = Column(Float, nullable=True)          # Active Power (W)
    energy = Column(Float, nullable=True)         # Energy (kWh)
    frequency = Column(Float, nullable=True)      # Frequency (Hz)
    power_factor = Column(Float, nullable=True)   # Power Factor (0-1.0)
    data_source = Column(String(50), default="NO LIVE DATA") # LIVE, DEMO, HISTORICAL, STALE, NO LIVE DATA

    __table_args__ = (
        Index("idx_system_meas_time", "timestamp"),
    )

class ChannelMeasurement(Base):
    """ZMPT101B + ACS712 + Relay Channel Measurements. STRICTLY ZERO TEMPERATURE."""
    __tablename__ = "channel_measurements"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    channel = Column(Integer, index=True, nullable=False) # 1, 2, 3, 4
    voltage = Column(Float, nullable=True)               # ZMPT101B (V)
    current = Column(Float, nullable=True)               # ACS712 (A)
    active_power = Column(Float, nullable=True)          # Authoritative Active Power (W)
    apparent_power = Column(Float, nullable=True)        # V * I (VA) - STRICTLY APPARENT POWER
    main_relay = Column(Boolean, nullable=True)          # Commanded Main Relay
    aux_relay = Column(Boolean, nullable=True)           # Commanded Aux Relay
    relay_feedback_available = Column(Boolean, default=False) # Explicit feedback flag
    load_active = Column(Boolean, nullable=True)         # Prototype Bulb Load state
    status = Column(String(50), default="WAITING FOR LIVE MQTT TELEMETRY") # NORMAL, WARNING, HIGH LOAD, CRITICAL, TRIPPED, FAULT LATCHED, WAITING FOR LIVE MQTT TELEMETRY
    fault = Column(String(50), nullable=True)            # Active fault category
    sensor_health = Column(String(30), default="VALID", nullable=True) # VALID, VALIDATING, SENSOR_INVALID, SENSOR_UNSTABLE
    risk_index = Column(Float, nullable=True)            # Project-defined Channel Risk Index (0-100)
    data_source = Column(String(50), default="NO LIVE DATA") # LIVE, DEMO, HISTORICAL, STALE, NO LIVE DATA


    __table_args__ = (
        Index("idx_channel_meas_chan_time", "channel", "timestamp"),
    )

class FaultEvent(Base):
    """Safety and Fault Records."""
    __tablename__ = "fault_events"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    fault_id = Column(String(50), unique=True, index=True, nullable=False)
    channel = Column(Integer, index=True, nullable=False) # 1, 2, 3, 4 or 0 for system
    fault_type = Column(String(50), index=True, nullable=False)
    # OVERCURRENT, OVERLOAD, OVERVOLTAGE, UNDERVOLTAGE, FREQUENCY_ABNORMALITY, 
    # POWER_FACTOR_ABNORMALITY, SENSOR_FAILURE, RELAY_FAILURE, COMMUNICATION_FAILURE, SYSTEM_FAULT
    severity = Column(String(20), index=True, nullable=False) # INFO, WARNING, CRITICAL
    measured_value = Column(Float, nullable=False)
    threshold = Column(Float, nullable=False)
    start_timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    end_timestamp = Column(DateTime, nullable=True)
    duration_sec = Column(Float, nullable=True)
    relay_state = Column(String(50), default="TRIPPED")
    resolution = Column(String(50), default="UNRESOLVED") # UNRESOLVED, ACKNOWLEDGED, RESOLVED
    acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(String(50), nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_by = Column(String(50), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

class RelayEvent(Base):
    """Relay switching history."""
    __tablename__ = "relay_events"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    channel = Column(Integer, index=True, nullable=False)
    relay_type = Column(String(20), nullable=False) # MAIN, AUXILIARY
    commanded_state = Column(String(10), nullable=False) # ON, OFF
    feedback_state = Column(String(30), default="FEEDBACK NOT AVAILABLE")
    trigger_reason = Column(String(100), nullable=False) # PROTECTION_TRIP, MANUAL, LOAD_SHEDDING, RESET
    user_or_process = Column(String(50), default="ESP32_PROTECTION_LOOP")

class LoadSheddingEvent(Base):
    """Priority-based Load Shedding Log."""
    __tablename__ = "load_shedding_events"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    channel = Column(Integer, nullable=False)
    priority_level = Column(String(20), nullable=False) # CRITICAL, IMPORTANT, NORMAL, NON-ESSENTIAL
    reason = Column(String(100), nullable=False)
    system_demand_w = Column(Float, nullable=False)
    configured_limit_w = Column(Float, nullable=False)
    action = Column(String(20), default="SHED") # SHED, RESTORED
    status = Column(String(20), default="ACTIVE")

class MaintenanceRecord(Base):
    """Maintenance management and duty-cycle logs."""
    __tablename__ = "maintenance_records"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    channel = Column(Integer, index=True, nullable=False)
    date = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    maintenance_type = Column(String(50), nullable=False) # ROUTINE, RELAY_TEST, CALIBRATION, POST_FAULT
    description = Column(Text, nullable=False)
    technician = Column(String(100), nullable=False)
    action_taken = Column(Text, nullable=False)
    notes = Column(Text, nullable=True)
    operating_hours = Column(Float, default=0.0)
    fault_count = Column(Integer, default=0)
    trip_count = Column(Integer, default=0)
    status = Column(String(20), default="NORMAL") # NORMAL, DUE_SOON, DUE, OVERDUE
    next_due_date = Column(DateTime, nullable=True)

class Notification(Base):
    """Real-time and historic notifications."""
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(20), index=True, nullable=False) # INFO, WARNING, CRITICAL
    channel = Column(Integer, nullable=True)
    category = Column(String(50), default="SYSTEM")
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    is_read = Column(Boolean, default=False)
    email_dispatched = Column(Boolean, default=False)

class SystemEvent(Base):
    """System and communication audit trail."""
    __tablename__ = "system_events"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    event_type = Column(String(50), nullable=False)
    component = Column(String(50), nullable=False) # ESP32, MQTT, BACKEND, WEBSOCKET, DATABASE, AI
    description = Column(Text, nullable=False)
    severity = Column(String(20), default="INFO")

class RiskScore(Base):
    """Historical project-defined channel risk logs."""
    __tablename__ = "risk_scores"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    channel = Column(Integer, index=True, nullable=False)
    score = Column(Float, nullable=False) # 0 to 100
    trend = Column(String(20), default="STABLE") # INCREASING, DECREASING, STABLE
    contributing_factors = Column(Text, nullable=True)
    model_version = Column(String(30), default="v1.0-project-heuristic")

class MLPrediction(Base):
    """Dynamic load forecasting logs."""
    __tablename__ = "ml_predictions"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    model_type = Column(String(50), default="RandomForestRegressor")
    model_version = Column(String(30), default="v1.0")
    horizon_minutes = Column(Integer, nullable=False) # 15, 30, 60
    predicted_load_w = Column(Float, nullable=False)
    confidence_lower = Column(Float, nullable=False)
    confidence_upper = Column(Float, nullable=False)
    features_summary = Column(Text, nullable=True)

class AIAnalysis(Base):
    """Advisory Gemini AI interactions log."""
    __tablename__ = "ai_analysis"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    prompt_type = Column(String(50), default="OPERATOR_QUERY")
    user_query = Column(Text, nullable=False)
    ai_response = Column(Text, nullable=False)
    advisory_notes = Column(Text, default="AI analysis is strictly advisory. AI cannot control relays or safety limits.")
    model_used = Column(String(50), default="gemini-2.5-flash")

class DeviceHeartbeat(Base):
    """ESP32 watchdog and telemetry link tracking."""
    __tablename__ = "device_heartbeats"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    device_id = Column(String(50), nullable=False)
    uptime_sec = Column(Integer, default=0)
    wifi_rssi = Column(Integer, default=-55)
    heap_free = Column(Integer, default=180000)
    mqtt_connected = Column(Boolean, default=True)

class AuthenticationEvent(Base):
    """Security and Face-Recognition Reset Authorization Log."""
    __tablename__ = "authentication_events"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    event_type = Column(String(50), nullable=False) # LOGIN, LOGOUT, FACE_RESET_AUTH, CONFIG_CHANGE
    username = Column(String(50), nullable=False)
    role = Column(String(20), nullable=False)
    auth_method = Column(String(30), default="PASSWORD") # PASSWORD, FACE_RECOGNITION, SESSION_TOKEN
    ip_address = Column(String(50), nullable=True)
    success = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)

class CalibrationConfig(Base):
    """ZMPT101B Voltage & ACS712 Current Sensor Calibration Storage (Section 4)."""
    __tablename__ = "calibration_configs"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    channel = Column(Integer, unique=True, index=True, nullable=False) # 1, 2, 3, 4
    voltage_scale = Column(Float, default=1.000, nullable=False)
    voltage_offset = Column(Float, default=0.0, nullable=False)
    current_scale = Column(Float, default=1.000, nullable=False)
    current_offset = Column(Float, default=0.0, nullable=False)
    zero_current_raw = Column(Float, default=2048.0, nullable=False)
    reference_voltage = Column(Float, default=230.0, nullable=False)
    reference_current = Column(Float, default=1.20, nullable=False)
    status = Column(String(30), default="CALIBRATED", nullable=False)
    calibrated_by = Column(String(50), default="System Admin", nullable=False)
    calibration_version = Column(Integer, default=1, nullable=False)
    last_calibrated = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

# =============================================================
# BIOMETRIC FACE AUTHENTICATION & RESET AUTHORIZATION (Section 42)
# =============================================================

class BiometricUser(Base):
    """Enrolled biometric identity authorized for safety reset operations."""
    __tablename__ = "biometric_users"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(50), unique=True, index=True, nullable=False) # e.g. "OP-042", "admin"
    display_name = Column(String(100), nullable=False)
    role = Column(String(20), default="OPERATOR", nullable=False) # ADMIN, OPERATOR (VIEWER not permitted to reset)
    status = Column(String(20), default="ACTIVE", nullable=False) # ACTIVE, DISABLED, REVOKED
    enrollment_version = Column(Integer, default=1, nullable=False)
    embedding_version = Column(String(50), default="facenet512-v1.0", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)
    last_verified_at = Column(DateTime, nullable=True)

class BiometricEnrollment(Base):
    """Secure multi-sample face embedding representation (no raw footage stored)."""
    __tablename__ = "biometric_enrollments"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    biometric_user_id = Column(Integer, ForeignKey("biometric_users.id"), nullable=False)
    user_id = Column(String(50), index=True, nullable=False)
    embedding_vector_json = Column(Text, nullable=False) # 512-dimensional normalized float vector as JSON
    sample_count = Column(Integer, default=5, nullable=False)
    average_quality_score = Column(Float, default=0.92, nullable=False)
    embedding_version = Column(String(50), default="facenet512-v1.0", nullable=False)
    model_version = Column(String(50), default="facenet512-l2norm", nullable=False)
    sample_metadata_json = Column(Text, nullable=True) # Per-sample quality & liveness metadata (no raw images)
    enrolled_by = Column(String(50), default="System Admin", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

class BiometricVerificationAttempt(Base):
    """Immutable forensic log of every face verification attempt (Section 23)."""
    __tablename__ = "biometric_verification_attempts"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    attempt_id = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(String(50), nullable=True, index=True)
    reset_request_id = Column(String(64), nullable=True, index=True)
    channel_id = Column(Integer, nullable=True)
    fault_id = Column(String(50), nullable=True)
    face_detected = Column(Boolean, default=False, nullable=False)
    face_count = Column(Integer, default=0, nullable=False)
    quality_score = Column(Float, default=0.0, nullable=False)
    liveness_score = Column(Float, default=0.0, nullable=False)
    similarity_score = Column(Float, default=0.0, nullable=False)
    decision = Column(String(30), nullable=False) # AUTHORIZED, DENIED, SPOOF_DETECTED, LOW_QUALITY, NO_FACE, MULTIPLE_FACES, TIMEOUT
    failure_reason = Column(String(100), nullable=True)
    model_version = Column(String(50), default="facenet512-v1.0")
    client_session_id = Column(String(64), nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)

class ResetRequest(Base):
    """Channel-specific fault reset request session (Section 20 & 21)."""
    __tablename__ = "reset_requests"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    request_id = Column(String(64), unique=True, index=True, nullable=False)
    channel_id = Column(Integer, nullable=False)
    fault_id = Column(String(50), nullable=False)
    requested_by = Column(String(50), default="Lead Operator", nullable=False)
    session_nonce = Column(String(64), nullable=False)
    status = Column(String(30), default="PENDING", nullable=False) # PENDING, VERIFYING, AUTHORIZED, EXECUTED, REJECTED, EXPIRED
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)

class ResetAuthorization(Base):
    """One-time cryptographic reset token bound to channel, fault, and user."""
    __tablename__ = "reset_authorizations"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    reset_request_id = Column(String(64), index=True, nullable=False)
    user_id = Column(String(50), nullable=False)
    channel_id = Column(Integer, nullable=False)
    token_hash = Column(String(64), unique=True, index=True, nullable=False) # SHA-256 of one-time token
    status = Column(String(20), default="VALID", nullable=False) # VALID, BURNED, EXPIRED, REVOKED
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class CommandEvent(Base):
    """Authoritative remote command audit trail (Trip, Reset, Load Shedding)."""
    __tablename__ = "command_events"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    correlation_id = Column(String(64), unique=True, index=True, nullable=False)
    command = Column(String(50), nullable=False) # TRIP_CHANNEL, RESET, RESET_REQUEST, etc.
    channel = Column(Integer, index=True, nullable=False) # 1, 2, 3, 4
    authorized_by = Column(String(100), nullable=False)
    authorization_id = Column(String(64), nullable=False)
    status = Column(String(30), default="SENT", index=True, nullable=False) # REQUESTED, AUTHENTICATING, AUTHORIZED, SENT, DEVICE_RECEIVED, EXECUTED, CONFIRMED, FAILED, TIMEOUT, REJECTED
    reason = Column(Text, nullable=True)
    device_mode = Column(String(30), default="SIMULATOR") # SIMULATOR, REAL_HARDWARE
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

