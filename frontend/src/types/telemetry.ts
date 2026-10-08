export type SystemState = 
  | "NORMAL" 
  | "WARNING" 
  | "HIGH LOAD" 
  | "CRITICAL" 
  | "TRIPPED" 
  | "FAULT LATCHED" 
  | "MAINTENANCE"
  | "WAITING FOR LIVE MQTT TELEMETRY"
  | "NO LIVE DATA"
  | "OFFLINE";

export type ChannelStatus = 
  | "NORMAL" 
  | "WARNING" 
  | "HIGH LOAD" 
  | "CRITICAL" 
  | "TRIPPED" 
  | "FAULT LATCHED"
  | "SENSOR INVALID"
  | "MAINTENANCE"
  | "OFFLINE"
  | "WAITING FOR LIVE MQTT TELEMETRY"
  | "NO LIVE DATA";

export type DataSourceType = 
  | "LIVE HARDWARE" 
  | "LIVE MQTT"
  | "LIVE MQTT PZEM-004T"
  | "DEMO DATA" 
  | "SIMULATED DEMO"
  | "HISTORICAL" 
  | "STALE" 
  | "NO LIVE DATA"
  | "NO LIVE DATA AVAILABLE"
  | "WAITING FOR LIVE MQTT TELEMETRY";


export type UserRole = "ADMIN" | "OPERATOR" | "VIEWER";

// PZEM-004T Overall Meter - STRICTLY ZERO TEMPERATURE
export interface SystemTelemetry {
  voltage: number | null;        // V
  current: number | null;        // A
  power: number | null;          // W (Active Power)
  energy: number | null;         // kWh
  frequency: number | null;      // Hz
  power_factor: number | null;   // 0.00 - 1.00
  data_source: DataSourceType | string;
  has_live_data?: boolean;
  last_update?: string;
}

// Prototype Load Channel - Active Power (W) Authoritative & Apparent Power (VA)
export interface ChannelData {
  channel: number;        // 1 - 4
  voltage: number | null;        // V (ZMPT101B)
  current: number | null;        // A (ACS712)
  active_power: number | null;   // W (Authoritative Active Power from ESP32/Backend)
  apparent_power: number | null; // VA (V x I strictly apparent power)
  main_relay: boolean | null;    // Commanded Main Relay
  aux_relay: boolean | null;     // Commanded Aux Relay
  relay_feedback?: string;       // "NOT_AVAILABLE" (No physical contact feedback hardware)
  relay_feedback_available: boolean; // Commanded vs Feedback distinction
  sensor_health?: "VALID" | "VALIDATING" | "SENSOR_INVALID" | "SENSOR_UNSTABLE" | string;
  load_active: boolean | null;   // Prototype Bulb Load active
  status: ChannelStatus;
  fault: string | null;
  fault_latched?: boolean;       // Latch state
  risk_index: number | null;     // 0 - 100 Project-defined Channel Risk Index
  data_source: DataSourceType | string;
  has_live_data?: boolean;
  last_update?: string | null;
  priority_level?: "CRITICAL" | "IMPORTANT" | "NORMAL" | "NON-ESSENTIAL";
  operating_hours?: number;
  trip_count?: number;
}

export interface FaultRecord {
  id: number;
  fault_id: string;
  channel: number;
  fault_type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  measured_value: number;
  threshold: number;
  start_timestamp: string;
  end_timestamp?: string | null;
  duration_sec?: number | null;
  relay_state: string;
  resolution: "UNRESOLVED" | "ACKNOWLEDGED" | "RESOLVED";
  acknowledged: boolean;
  acknowledged_by?: string | null;
  notes?: string | null;
}

export interface DynamicForecast {
  current_load_w: number;
  forecast_15m: {
    minutes_ahead: number;
    predicted_load_w: number;
    confidence_lower: number;
    confidence_upper: number;
    trend: string;
  };
  forecast_30m: {
    minutes_ahead: number;
    predicted_load_w: number;
    confidence_lower: number;
    confidence_upper: number;
    trend: string;
  };
  forecast_60m: {
    minutes_ahead: number;
    predicted_load_w: number;
    confidence_lower: number;
    confidence_upper: number;
    trend: string;
  };
  model_name: string;
  evaluation_mae_w: number;
  uncertainty_envelope_pct: number;
  disclaimer: string;
}

export interface ChannelRiskScore {
  channel: number;
  risk_score: number;
  trend: string;
  current_stress_contribution: number;
  voltage_stability_contribution: number;
  trip_frequency_contribution: number;
  overload_duration_contribution: number;
  summary: string;
}

export interface ComponentHealth {
  name: string;
  status: string;
  latency_ms?: number | null;
  details: string;
  last_ping?: string | null;
  last_successful?: string | null;
  reason?: string | null;
  measured_at?: string | null;
}

export interface PipelineStageHealth {
  stage: string;
  status: string;
  details: string;
  last_activity?: string | null;
}

export interface HardwareWatchdogStatus {
  status: "ACTIVE" | "NOT_AVAILABLE" | string;
  reported: boolean;
  interval_ms?: number | null;
}

export interface SystemHealthData {
  overall_status: "FULLY_OPERATIONAL" | "PARTIALLY_OPERATIONAL" | "WAITING_FOR_HARDWARE" | "TELEMETRY_STALE" | "SYSTEM_FAULT" | "SERVICE_DEGRADED" | "UNKNOWN" | string;
  overall_message?: string;
  esp32: ComponentHealth;
  physical_esp32?: ComponentHealth;
  simulator?: ComponentHealth;
  simulator_mqtt?: ComponentHealth;
  device_mode?: string;
  telemetry_source?: string;
  mqtt_broker: ComponentHealth;
  mqtt_device_session?: ComponentHealth;
  node_red: ComponentHealth;
  node_red_mqtt?: ComponentHealth;
  node_red_pipeline?: ComponentHealth;
  backend_api: ComponentHealth;
  database: ComponentHealth;
  websocket: ComponentHealth;
  ai_service: ComponentHealth;
  live_telemetry?: ComponentHealth;
  pipeline?: Record<string, PipelineStageHealth>;
  pipeline_failure_stage?: string | null;
  hardware_watchdog?: HardwareWatchdogStatus;
  data_freshness: string;
  uptime_seconds: number;
  last_health_check?: string;
  history?: Array<{
    timestamp: string;
    service: string;
    status: string;
    details: string;
  }>;
}
