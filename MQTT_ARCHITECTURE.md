# GRIDGUARD — MQTT ARCHITECTURE & TOPIC SPECIFICATION

---

## 1. Broker Infrastructure
- **Production Broker**: HiveMQ Cloud
- **Hostname**: `260e034f069c4cb895d24c44549ac094.s1.eu.hivemq.cloud`
- **MQTT TLS Port**: `8883`
- **MQTT WebSocket Port**: `8884`
- **Security Policy**: Strict TLS encryption required (`WiFiClientSecure` on ESP32-S3, `tls-config` in Node-RED).
- **Prohibited Broker**: Public test sandbox `broker.hivemq.com` is strictly prohibited and removed from production configurations.

---

## 2. Ingestion Architecture: Single Authoritative Consumer
- **Authoritative Ingress Layer**: **Node-RED** is designated as the sole authoritative MQTT consumer.
- **FastAPI MQTT State**: FastAPI runs with `MQTT_AUTHORITATIVE_INGRESS=NODERED`. FastAPI does NOT spawn a competing subscriber to avoid duplicate database inserts, race conditions, or out-of-order telemetry processing.
- **Publishing**: When FastAPI issues an authorized reset command, it publishes directly to `smarttransformer/commands` via HiveMQ Cloud.

---

## 3. MQTT Topic Hierarchy

| Topic Name | Producer | Consumers | Description |
|:---|:---|:---|:---|
| `smarttransformer/status` | ESP32-S3 | Node-RED | Device online/offline status and uptime |
| `smarttransformer/heartbeat` | ESP32-S3 | Node-RED | Periodic keep-alive ping (every 5 seconds) |
| `smarttransformer/system` | ESP32-S3 | Node-RED | PZEM-004T overall system telemetry |
| `smarttransformer/channel/1` | ESP32-S3 | Node-RED | Prototype Channel 1 electrical telemetry |
| `smarttransformer/channel/2` | ESP32-S3 | Node-RED | Prototype Channel 2 electrical telemetry |
| `smarttransformer/channel/3` | ESP32-S3 | Node-RED | Prototype Channel 3 electrical telemetry |
| `smarttransformer/channel/4` | ESP32-S3 | Node-RED | Prototype Channel 4 electrical telemetry |
| `smarttransformer/events` | ESP32-S3 | Node-RED | Safety trip events and state transitions |
| `smarttransformer/faults` | ESP32-S3 | Node-RED | Latched fault declarations |
| `smarttransformer/commands` | FastAPI | ESP32-S3 | Authenticated reset and load-shedding commands |
| `smarttransformer/commands/status` | ESP32-S3 | Node-RED / Backend | Acknowledgment or safety rejection of command |

---

## 4. Telemetry Payload Schemas

### 4.1 System Telemetry (`smarttransformer/system`)
```json
{
  "timestamp": "2026-09-19T12:00:00Z",
  "voltage": 230.4,
  "current": 4.21,
  "power": 918.5,
  "energy": 2.34,
  "frequency": 50.1,
  "power_factor": 0.94,
  "data_source": "LIVE MQTT"
}
```
*Strictly zero temperature fields. Prohibited keys (`temperature`, `temp`, `thermal`) cause immediate packet rejection.*

### 4.2 Channel Telemetry (`smarttransformer/channel/<id>`)
```json
{
  "timestamp": "2026-09-19T12:00:00Z",
  "channel": 1,
  "voltage": 230.2,
  "current": 1.21,
  "apparent_power": 278.5,
  "main_relay": true,
  "aux_relay": true,
  "load": true,
  "status": "NORMAL",
  "fault": null,
  "data_source": "LIVE MQTT"
}
```
*Apparent power is calculated as $V \times I$ in VA. Valid channel IDs are strictly 1, 2, 3, or 4.*

### 4.3 Command Payload (`smarttransformer/commands`)
```json
{
  "command": "RESET_REQUEST",
  "action": "RESET_LATCH",
  "channel": 2,
  "authorization_id": "8f3b0e11a2",
  "nonce": "c49a37e192f1",
  "correlation_id": "CORR-MULTI-481A",
  "authorized_by": "Lead Protection Operator",
  "relay_stagger_delay_ms": 250,
  "timestamp": "2026-09-19T12:05:00Z"
}
```
