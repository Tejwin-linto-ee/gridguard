import os
from typing import List
from dotenv import load_dotenv
from pydantic import BaseModel

# Load environment configuration from root .env
load_dotenv()

class Settings(BaseModel):
    PROJECT_NAME: str = "GRIDGUARD"
    TAGLINE: str = "Intelligent Protection. Real-Time Visibility."
    API_V1_STR: str = "/api"
    SECRET_KEY: str = os.getenv("JWT_SECRET", "gridguard-super-secure-industrial-iot-key-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database: Supports SQLite for instant local zero-dependency runs or PostgreSQL for production
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./gridguard.db")
    
    # Controller & Device Mode (SIMULATOR or REAL_HARDWARE)
    DEVICE_MODE: str = os.getenv("DEVICE_MODE", "SIMULATOR") # SIMULATOR or REAL_HARDWARE
    DEVICE_ID: str = os.getenv("DEVICE_ID", "GRIDGUARD-ESP32-SIM-001")
    HARDWARE_TYPE: str = os.getenv("HARDWARE_TYPE", "ESP32-S3 SIMULATOR")

    # MQTT Ingestion & HiveMQ Cloud Configuration
    MQTT_AUTHORITATIVE_INGRESS: str = os.getenv("MQTT_AUTHORITATIVE_INGRESS", "NODERED") # NODERED or FASTAPI
    MQTT_HOST: str = os.getenv("MQTT_HOST", "260e034f069c4cb895d24c44549ac094.s1.eu.hivemq.cloud")
    MQTT_BROKER: str = os.getenv("MQTT_BROKER", "260e034f069c4cb895d24c44549ac094.s1.eu.hivemq.cloud")
    MQTT_PORT: int = int(os.getenv("MQTT_PORT", "8883"))
    MQTT_TLS: bool = os.getenv("MQTT_TLS", "true").lower() in ("true", "1", "yes")
    MQTT_USERNAME: str = os.getenv("MQTT_USERNAME", "gridguard_device")
    MQTT_PASSWORD: str = os.getenv("MQTT_PASSWORD", "tEJWIN@cce@19801983")
    MQTT_CLIENT_ID: str = os.getenv("MQTT_CLIENT_ID", "gridguard_backend_service")
    MQTT_TOPIC_STATUS: str = "smarttransformer/status"
    MQTT_TOPIC_SYSTEM: str = "smarttransformer/system"
    MQTT_TOPIC_CHANNELS: str = "smarttransformer/channel/+"
    MQTT_TOPIC_EVENTS: str = "smarttransformer/events"
    MQTT_TOPIC_FAULTS: str = "smarttransformer/faults"
    MQTT_TOPIC_HEARTBEAT: str = "smarttransformer/heartbeat"
    MQTT_TOPIC_COMMANDS: str = "smarttransformer/commands"
    MQTT_TOPIC_COMMANDS_STATUS: str = "smarttransformer/commands/status"

    # Gemini AI API Key (strictly backend only)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # Email notification configuration
    EMAIL_HOST: str = os.getenv("EMAIL_HOST", "smtp.example.com")
    EMAIL_PORT: int = int(os.getenv("EMAIL_PORT", "587"))
    EMAIL_USERNAME: str = os.getenv("EMAIL_USERNAME", "")
    EMAIL_PASSWORD: str = os.getenv("EMAIL_PASSWORD", "")
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "alerts@gridguard.iot")

    # Protection Default Thresholds
    OVERCURRENT_THRESHOLD_A: float = 2.5
    OVERLOAD_THRESHOLD_VA: float = 600.0
    OVERVOLTAGE_THRESHOLD_V: float = 250.0
    UNDERVOLTAGE_THRESHOLD_V: float = 190.0
    FREQUENCY_MIN_HZ: float = 47.5
    FREQUENCY_MAX_HZ: float = 52.5
    POWER_FACTOR_MIN: float = 0.80
    PERSISTENCE_SEC: float = 1.0
    HYSTERESIS_PCT: float = 5.0

    # System-level load shedding limit
    LOAD_SHEDDING_DEMAND_LIMIT_W: float = 1200.0

    # Authoritative Relay Sequencing & Stabilization Timing (ms)
    MAIN_RELAY_STABILIZATION_MS: int = 250
    STABILIZATION_OBSERVATION_WINDOW_MS: int = 2000

    # Production-Grade Health Monitoring & Heartbeat Timeouts (seconds)
    DEVICE_HEARTBEAT_TIMEOUT_SECONDS: float = float(os.getenv("DEVICE_HEARTBEAT_TIMEOUT_SECONDS", "15.0"))
    TELEMETRY_STALE_TIMEOUT_SECONDS: float = float(os.getenv("TELEMETRY_STALE_TIMEOUT_SECONDS", "12.0"))
    NODERED_HEALTH_URL: str = os.getenv("NODERED_HEALTH_URL", "http://127.0.0.1:1880/")

    # CORS Origins
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "*"]

settings = Settings()
