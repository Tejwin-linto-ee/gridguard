from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime

# Auth Schemas
class UserLoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

# Ingestion Schemas - STRICT ZERO TEMPERATURE POLICY
class DeviceStatusIngestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device: str = Field(..., min_length=1, max_length=50)
    status: str = Field(..., min_length=1, max_length=20)
    timestamp: Optional[datetime] = None
    uptime: Optional[int] = Field(default=None, ge=0)
    rssi: Optional[int] = Field(default=None)

    @model_validator(mode="before")
    @classmethod
    def check_zero_temperature(cls, values: Any):
        if isinstance(values, dict):
            for k in values.keys():
                if any(bad in k.lower() for bad in ["temp", "thermal", "temperature"]):
                    raise ValueError(f"Strict Zero-Temperature Policy Violation: Field '{k}' is prohibited.")
        return values

class SystemTelemetryIngestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timestamp: Optional[datetime] = None
    voltage: Optional[float] = Field(default=None, ge=0.0, le=1000.0)
    current: Optional[float] = Field(default=None, ge=0.0, le=500.0)
    power: Optional[float] = Field(default=None, ge=0.0, le=500000.0)
    energy: Optional[float] = Field(default=None, ge=0.0)
    frequency: Optional[float] = Field(default=None, ge=0.0, le=200.0)
    power_factor: Optional[float] = Field(default=None, ge=-1.0, le=1.0)
    data_source: Optional[str] = Field(default=None, max_length=50)

    @model_validator(mode="before")
    @classmethod
    def check_zero_temperature(cls, values: Any):
        if isinstance(values, dict):
            for k in values.keys():
                if any(bad in k.lower() for bad in ["temp", "thermal", "temperature"]):
                    raise ValueError(f"Strict Zero-Temperature Policy Violation: Field '{k}' is prohibited.")
        return values

class ChannelTelemetryIngestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timestamp: Optional[datetime] = None
    channel: int = Field(..., ge=1, le=4)
    voltage: Optional[float] = Field(default=None, ge=0.0, le=1000.0)
    current: Optional[float] = Field(default=None, ge=0.0, le=500.0)
    active_power: Optional[float] = Field(default=None, ge=0.0, le=500000.0)
    apparent_power: Optional[float] = Field(default=None, ge=0.0, le=500000.0)
    apparent_power_va: Optional[float] = Field(default=None, ge=0.0, le=500000.0)
    main_relay: Optional[bool] = None
    aux_relay: Optional[bool] = None
    load: Optional[bool] = None
    load_active: Optional[bool] = None
    status: Optional[str] = Field(default=None, max_length=50)
    fault: Optional[str] = Field(default=None, max_length=50)
    fault_latched: Optional[bool] = None
    sensor_health: Optional[str] = Field(default=None, max_length=50)
    relay_feedback: Optional[str] = Field(default=None, max_length=50)
    device_id: Optional[str] = Field(default=None, max_length=50)
    device_mode: Optional[str] = Field(default=None, max_length=50)
    hardware_type: Optional[str] = Field(default=None, max_length=50)
    data_source: Optional[str] = Field(default=None, max_length=50)

    @model_validator(mode="before")
    @classmethod
    def check_zero_temperature(cls, values: Any):
        if isinstance(values, dict):
            for k in values.keys():
                if any(bad in k.lower() for bad in ["temp", "thermal", "temperature"]):
                    raise ValueError(f"Strict Zero-Temperature Policy Violation: Field '{k}' is prohibited.")
        return values

# Telemetry Schemas - STRICTLY NO TEMPERATURE
class SystemMeasurementSchema(BaseModel):
    timestamp: Optional[datetime] = None
    voltage: Optional[float] = Field(default=None, description="System Voltage from PZEM-004T (V)")
    current: Optional[float] = Field(default=None, description="Total System Current from PZEM-004T (A)")
    power: Optional[float] = Field(default=None, description="Active Power from PZEM-004T (W)")
    energy: Optional[float] = Field(default=None, description="Cumulative Energy from PZEM-004T (kWh)")
    frequency: Optional[float] = Field(default=None, description="Grid Frequency from PZEM-004T (Hz)")
    power_factor: Optional[float] = Field(default=None, description="Power Factor from PZEM-004T (0.00-1.00)")
    data_source: str = Field(default="NO LIVE DATA", description="LIVE, DEMO, HISTORICAL, STALE, or NO LIVE DATA")

class ChannelMeasurementSchema(BaseModel):
    timestamp: Optional[datetime] = None
    channel: int = Field(..., ge=1, le=4, description="Prototype Load Channel (1-4)")
    voltage: Optional[float] = Field(default=None, description="Channel Voltage from ZMPT101B (V)")
    current: Optional[float] = Field(default=None, description="Channel Current from ACS712 (A)")
    active_power: Optional[float] = Field(default=None, description="Authoritative Active Power (W)")
    apparent_power: Optional[float] = Field(default=None, description="Calculated V x I Apparent Power (VA)")
    main_relay: Optional[bool] = Field(default=None, description="Main Relay Commanded State")
    aux_relay: Optional[bool] = Field(default=None, description="Auxiliary Relay Commanded State")
    relay_feedback_available: bool = Field(default=False, description="Physical feedback availability flag")
    relay_feedback: Optional[str] = Field(default="NOT_AVAILABLE", description="Relay Physical Feedback")
    sensor_health: Optional[str] = Field(default="VALID", description="Sensor Health State (VALID, VALIDATING, SENSOR_INVALID, SENSOR_UNSTABLE)")
    load_active: Optional[bool] = Field(default=None, description="Prototype Bulb Load Active State")
    status: str = Field(default="WAITING FOR LIVE MQTT TELEMETRY", description="NORMAL, WARNING, HIGH LOAD, CRITICAL, TRIPPED, FAULT LATCHED, WAITING FOR LIVE MQTT TELEMETRY")
    fault: Optional[str] = Field(default=None, description="Active Fault Category")
    fault_latched: Optional[bool] = Field(default=False, description="Fault Latch State")
    risk_index: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Project-defined Channel Risk Index (0-100)")
    data_source: str = Field(default="NO LIVE DATA", description="LIVE, DEMO, HISTORICAL, STALE")
    has_live_data: bool = Field(default=False)

class ChannelDetailSchema(ChannelMeasurementSchema):
    operating_hours: float = 120.0
    trip_count: int = 0
    max_voltage_recorded: Optional[float] = None
    max_current_recorded: Optional[float] = None
    priority_level: str = "NORMAL"

class LiveTelemetryPackage(BaseModel):
    system: SystemMeasurementSchema
    channels: List[ChannelMeasurementSchema]
    active_faults_count: int
    load_shedding_active: bool
    esp32_status: str
    mqtt_status: str
    backend_status: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# Fault Schemas
class FaultEventSchema(BaseModel):
    id: int
    fault_id: str
    channel: int
    fault_type: str
    severity: str # INFO, WARNING, CRITICAL
    measured_value: float
    threshold: float
    start_timestamp: datetime
    end_timestamp: Optional[datetime] = None
    duration_sec: Optional[float] = None
    relay_state: str
    resolution: str
    acknowledged: bool
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    notes: Optional[str] = None

class FaultAcknowledgeRequest(BaseModel):
    notes: Optional[str] = None

class FaultResolveRequest(BaseModel):
    notes: str

# Relay Command & Face Auth Reset Schemas
class RelayCommandRequest(BaseModel):
    channel: int = Field(..., ge=1, le=4)
    relay_type: str = Field("MAIN", description="MAIN or AUXILIARY")
    action: str = Field(..., description="CLOSE (ON) or OPEN (OFF)")
    reason: str = "OPERATOR_OVERRIDE"

class FaceAuthResetRequest(BaseModel):
    channel: int = Field(..., ge=1, le=4)
    reset_request: bool = True
    authentication_result: bool = Field(..., description="Result from laptop face recognition verification")
    authorized_identity: str = Field(..., description="Verified operator name/identity")
    face_confidence: float = Field(default=0.98, ge=0.0, le=1.0)
    client_timestamp: str

class FaceAuthResetResponse(BaseModel):
    success: bool
    channel: int
    status: str # RESET_AUTHORIZED, SAFETY_CHECK_PASSED, SAFETY_CHECK_FAILED, UNAUTHORIZED
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    relay_action_taken: str

class RemoteTripCommandRequest(BaseModel):
    command: str = "TRIP_CHANNEL"
    channel: Optional[int] = None
    authorized_by: Optional[str] = None
    authorization_id: Optional[str] = None
    correlation_id: Optional[str] = None
    authorization_token: Optional[str] = None

class RemoteResetCommandRequest(BaseModel):
    command: str = "RESET"
    channel: Optional[int] = None
    authorized_by: Optional[str] = None
    authorization_id: Optional[str] = None
    correlation_id: Optional[str] = None
    authorization_token: Optional[str] = None

# Load Shedding
class LoadSheddingConfig(BaseModel):
    system_demand_limit_w: float = 1200.0
    channel_priorities: Dict[int, str] = {
        1: "CRITICAL",
        2: "IMPORTANT",
        3: "NORMAL",
        4: "NON-ESSENTIAL"
    }

class LoadSheddingEventSchema(BaseModel):
    id: int
    timestamp: datetime
    channel: int
    priority_level: str
    reason: str
    system_demand_w: float
    configured_limit_w: float
    action: str
    status: str

# Dynamic Load Forecasting & Risk Index
class ForecastPoint(BaseModel):
    minutes_ahead: int
    predicted_load_w: Optional[float] = None
    confidence_lower: Optional[float] = None
    confidence_upper: Optional[float] = None
    trend: str # UPWARD, STABLE, DOWNWARD, FORECAST UNAVAILABLE

class DynamicForecastResponse(BaseModel):
    current_load_w: Optional[float] = None
    forecast_15m: ForecastPoint
    forecast_30m: ForecastPoint
    forecast_60m: ForecastPoint
    model_name: str = "Ridge-TimeSeries-v1"
    evaluation_mae_w: Optional[float] = None
    uncertainty_envelope_pct: Optional[float] = None
    disclaimer: str = "Projected loading model based on historical prototypes."

class ChannelRiskAnalysis(BaseModel):
    channel: int
    risk_score: Optional[float] = None # 0-100 or None if insufficient live data
    trend: str # STABLE, INCREASING, DECREASING, or RISK UNAVAILABLE
    current_stress_contribution: Optional[float] = None
    overload_duration_contribution: Optional[float] = None
    trip_frequency_contribution: Optional[float] = None
    voltage_stability_contribution: Optional[float] = None
    summary: str
# Fault Classification ML Schemas (Step 23)
class FaultClassificationResponse(BaseModel):
    status: str # "AVAILABLE" or "MODEL UNAVAILABLE — INSUFFICIENT TRAINING DATA"
    model_name: str = "RandomForest-FaultClassifier-v1"
    accuracy: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1_score: Optional[float] = None
    confusion_matrix: Optional[List[List[int]]] = None
    classes: List[str] = []
    training_samples: int = 0
    features_used: List[str] = ["voltage", "current", "apparent_power", "frequency", "power_factor"]
    disclaimer: str = "Deterministic electrical telemetry classifier. Strictly zero temperature."

class FaultClassificationPrediction(BaseModel):
    predicted_class: str
    confidence: float
    probabilities: dict
    is_fault: bool
    status: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# Gemini AI Advisory Schemas
class AIAnalysisRequest(BaseModel):
    query: str
    channel: Optional[int] = None
    include_fault_context: bool = True

class AIAnalysisResponse(BaseModel):
    query: str
    analysis: str
    advisory_recommendations: List[str]
    model_version: str = "gemini-2.5-flash"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    safety_disclaimer: str = "AI is strictly ADVISORY. AI cannot trip relays, alter protection safety limits, or bypass latched faults."

# System Health
class ComponentHealth(BaseModel):
    name: str
    status: str # ONLINE, OFFLINE, CONNECTED, DISCONNECTED, AVAILABLE, UNAVAILABLE, NOT_CONFIGURED, NOT_CONNECTED, DEGRADED, STALE, WAITING
    latency_ms: Optional[float] = None
    details: str
    last_ping: Optional[datetime] = None
    last_successful: Optional[datetime] = None
    reason: Optional[str] = None
    measured_at: Optional[datetime] = None

class PipelineStageHealth(BaseModel):
    stage: str
    status: str # CONNECTED, DISCONNECTED, RECEIVING, NO_DATA, HEALTHY, STREAMING, OFFLINE
    details: str
    last_activity: Optional[datetime] = None

class HardwareWatchdogStatus(BaseModel):
    status: str = "NOT_AVAILABLE" # NOT_AVAILABLE or ACTIVE (never hardcoded 100ms)
    reported: bool = False
    interval_ms: Optional[int] = None

class SystemHealthResponse(BaseModel):
    overall_status: str # FULLY_OPERATIONAL, PARTIALLY_OPERATIONAL, WAITING_FOR_HARDWARE, TELEMETRY_STALE, SYSTEM_FAULT, SERVICE_DEGRADED, UNKNOWN
    overall_message: str = ""
    esp32: ComponentHealth
    physical_esp32: Optional[ComponentHealth] = None
    simulator: Optional[ComponentHealth] = None
    simulator_mqtt: Optional[ComponentHealth] = None
    device_mode: str = "NONE" # PHYSICAL, SIMULATOR, NONE
    telemetry_source: str = "NONE" # PHYSICAL_ESP32, SIMULATOR, NONE
    mqtt_broker: ComponentHealth
    mqtt_device_session: ComponentHealth
    node_red: ComponentHealth
    node_red_mqtt: Optional[ComponentHealth] = None
    node_red_pipeline: ComponentHealth
    backend_api: ComponentHealth
    database: ComponentHealth
    websocket: ComponentHealth
    ai_service: ComponentHealth
    live_telemetry: ComponentHealth
    pipeline: Dict[str, PipelineStageHealth] = {}
    pipeline_failure_stage: Optional[str] = None
    hardware_watchdog: HardwareWatchdogStatus = Field(default_factory=HardwareWatchdogStatus)
    data_freshness: str = "NO LIVE DATA" # LIVE, RECENT, STALE, NO LIVE DATA, OFFLINE
    uptime_seconds: int = 0
    last_health_check: datetime = Field(default_factory=datetime.utcnow)
    history: List[Dict[str, Any]] = []

# Calibration Schemas (Section 4, 5, 6)
class CalibrationChannelSchema(BaseModel):
    channel: int
    raw_voltage: float
    raw_current: float
    raw_adc_voltage: int
    raw_adc_current: int
    voltage_scale: float
    voltage_offset: float
    current_scale: float
    current_offset: float
    zero_current_raw: float
    reference_voltage: float
    reference_current: float
    calibrated_voltage: float
    calibrated_current: float
    voltage_error_pct: float
    current_error_pct: float
    sensor_quality: str # GOOD, WARNING, BAD, OFFLINE
    status: str # CALIBRATED, PENDING, UNCALIBRATED
    calibrated_by: str
    version: int
    last_calibrated: str

class CalibrationUpdateRequest(BaseModel):
    channel: int = Field(..., ge=1, le=4)
    voltage_scale: float = 1.0
    voltage_offset: float = 0.0
    current_scale: float = 1.0
    current_offset: float = 0.0
    zero_current_raw: float = 2048.0
    reference_voltage: float = 230.0
    reference_current: float = 1.20
    calibrated_by: Optional[str] = "System Admin"

class ZeroCurrentRequest(BaseModel):
    channel: int = Field(..., ge=1, le=4)
    zero_raw: Optional[float] = 2048.0

# Event Timeline Schema (Section 35)
class TimelineEventSchema(BaseModel):
    id: str
    timestamp: str
    channel: Optional[int] = None
    level: str # NORMAL, WARNING, HIGH_LOAD, CRITICAL, TRIPPED, FAULT_LATCHED, RESET, SYSTEM
    event_type: str
    source: str # ESP32_LOCAL, SCADA_ENGINE, FACE_AUTH, OPERATOR, LOAD_SHEDDING
    description: str
    measured_value: Optional[float] = None
    threshold: Optional[float] = None
    action_taken: Optional[str] = None

# Latency Benchmark Schema (Section 49)
class LatencyBenchmarkItem(BaseModel):
    subsystem: str
    description: str
    target_ms: float
    measured_ms: Optional[float] = None
    pass_fail: str # PASS, FAIL, NOT_MEASURED, NOT_AVAILABLE

class LatencyBenchmarkResponse(BaseModel):
    benchmark_timestamp: str
    protection_domain_independent: bool
    benchmarks: List[LatencyBenchmarkItem]
    overall_status: str

