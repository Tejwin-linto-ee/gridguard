# GRIDGUARD — PRODUCTION DEPLOYMENT GUIDE

---

## 1. Prerequisites
- **Operating System**: Linux (Ubuntu 22.04 LTS recommended) or Windows Server
- **Python**: 3.11 or 3.12 with virtual environment
- **Node.js**: v18+ or v20 LTS
- **PostgreSQL**: 15+ or 16 with `pg_stat_statements`
- **Node-RED**: 3.x+
- **Broker**: HiveMQ Cloud with valid TLS credentials

---

## 2. Environment Configuration
Create `.env` in the root directory (never commit to Git):
```bash
# General
PROJECT_NAME="GRIDGUARD"
JWT_SECRET="YOUR_CRYPTOGRAPHICALLY_RANDOM_SECRET_KEY"

# Database (PostgreSQL Production)
DATABASE_URL="postgresql+asyncpg://gridguard_user:YOUR_DB_PASS@localhost:5432/gridguard"

# MQTT HiveMQ Cloud
MQTT_AUTHORITATIVE_INGRESS="NODERED"
MQTT_HOST="260e034f069c4cb895d24c44549ac094.s1.eu.hivemq.cloud"
MQTT_PORT="8883"
MQTT_TLS="true"
MQTT_USERNAME="gridguard_device"
MQTT_PASSWORD="YOUR_HIVEMQ_PASSWORD"

# Gemini AI (Server-side only)
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Email Notifications
EMAIL_HOST="smtp.yourprovider.com"
EMAIL_PORT="587"
EMAIL_USERNAME="alerts@gridguard.iot"
EMAIL_PASSWORD="YOUR_SMTP_PASSWORD"
```

---

## 3. Starting the Services

### 3.1 Backend Service (FastAPI)
```bash
cd backend
source venv/bin/activate   # or .\venv\Scripts\activate on Windows
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 3.2 Node-RED Ingestion Layer
Import `nodered/flows.json` into Node-RED. Verify that the MQTT broker node uses TLS with server name `260e034f069c4cb895d24c44549ac094.s1.eu.hivemq.cloud:8883` and correct credentials. Deploy flows.

### 3.3 Frontend Service (Next.js)
```bash
cd frontend
npm run build
npm start -- -p 3000
```

### 3.4 Edge Node (ESP32-S3)
1. Copy `firmware/secrets.h.example` to `firmware/secrets.h`.
2. Configure local Wi-Fi SSID, Wi-Fi password, and HiveMQ Cloud password.
3. Flash using Arduino IDE / PlatformIO with Octal PSRAM enabled.
