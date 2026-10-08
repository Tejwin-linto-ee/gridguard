# GRIDGUARD — MQTT Telemetry & Protocol Specification

## 1. Broker Infrastructure & Authentication
Production telemetry uses private authenticated HiveMQ Cloud with TLS/SSL encryption on port 8883.
Credentials and host configurations are injected via environment variables:

```bash
MQTT_BROKER_HOST=your-cluster-id.hivemq.cloud
MQTT_BROKER_PORT=8883
MQTT_USERNAME=gridguard_edge_node
MQTT_PASSWORD=****************
MQTT_CLIENT_ID=GRIDGUARD-ESP32S3-01
```

> **Security Rule**: Anonymous and unencrypted public MQTT brokers are strictly prohibited in production configurations.

---

## 2. Topic Hierarchy

| Topic Pattern | Direction | QoS | Retain | Purpose |
|---|---|---|---|---|
| `gridguard/system` | ESP32 ➔ Broker | 1 | No | Bulk system telemetry from PZEM-004T (V, I_total, P, E, f, PF) |
| `gridguard/channel/1` | ESP32 ➔ Broker | 1 | No | Prototype Feeder Channel 1 measurements (V, I, VA, Relay, Status) |
| `gridguard/channel/2` | ESP32 ➔ Broker | 1 | No | Prototype Feeder Channel 2 measurements |
| `gridguard/channel/3` | ESP32 ➔ Broker | 1 | No | Prototype Feeder Channel 3 measurements |
| `gridguard/channel/4` | ESP32 ➔ Broker | 1 | No | Prototype Feeder Channel 4 measurements |
| `gridguard/events` | ESP32 ➔ Broker | 2 | Yes | State changes, warning triggers, load-shedding events |
| `gridguard/faults` | ESP32 ➔ Broker | 2 | Yes | Critical trip snapshots with full forensic telemetry |
| `gridguard/heartbeat` | ESP32 ➔ Broker | 0 | No | Keep-alive heartbeat packet every 5 seconds (Heap, RSSI, Uptime) |
| `gridguard/status` | ESP32 ➔ Broker | 1 | Yes | Last Will and Testament (LWT) topic (`ONLINE` / `OFFLINE`) |
| `gridguard/commands` | SCADA ➔ ESP32 | 2 | No | Authorized safety reset commands (carrying biometric tokens) |

---

## 3. Structured Payload Specifications

### A. Bulk System Telemetry (`gridguard/system`)
```json
{
  "device_id": "GRIDGUARD-ESP32S3-01",
  "timestamp": "2026-09-18T10:30:00.124Z",
  "sequence": 10452,
  "voltage": 230.4,
  "current": 4.21,
  "active_power": 918.5,
  "energy_kwh": 2.34,
  "frequency": 50.1,
  "power_factor": 0.94,
  "status": "NORMAL",
  "quality": "GOOD"
}
```

### B. Per-Channel Feeder Telemetry (`gridguard/channel/{1..4}`)
```json
{
  "device_id": "GRIDGUARD-ESP32S3-01",
  "timestamp": "2026-09-18T10:30:00.128Z",
  "sequence": 10452,
  "channel": 2,
  "voltage": 230.8,
  "current": 1.25,
  "apparent_power": 288.5,
  "main_relay_commanded": true,
  "aux_relay_commanded": true,
  "physical_feedback_available": false,
  "load_active": true,
  "status": "NORMAL",
  "fault": null,
  "quality": "GOOD"
}
```

### C. Forensic Fault Snapshot (`gridguard/faults`)
```json
{
  "event_id": "FLT-CH2-B4E1",
  "device_id": "GRIDGUARD-ESP32S3-01",
  "timestamp": "2026-09-18T10:32:15.012Z",
  "channel": 2,
  "fault_type": "OVERCURRENT",
  "severity": "CRITICAL",
  "measured_current": 3.45,
  "threshold_current": 2.50,
  "duration_ms": 1040,
  "voltage_at_trip": 228.4,
  "system_active_power_w": 1350.2,
  "system_frequency_hz": 50.02,
  "power_factor": 0.92,
  "relays_commanded": "OPEN",
  "latch_status": "LATCHED",
  "authorized_reset_required": true
}
```

---

## 4. Freshness & Sequence Validation
Every telemetry packet includes an incrementing 32-bit `sequence` number and ISO UTC `timestamp`. The supervisory backend continuously detects:
- **Duplicate Packets**: Dropped if `seq <= last_received_seq`.
- **Out-of-Order Packets**: Logged into audit trail.
- **Data Freshness Classification**:
  - `LIVE`: Packet age $< 10\text{ seconds}$
  - `RECENT`: Packet age $10\text{s} \le t < 60\text{s}$
  - `STALE`: Packet age $60\text{s} \le t < 300\text{s}$
  - `OFFLINE`: Packet age $\ge 300\text{ seconds}$
