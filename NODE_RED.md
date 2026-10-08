# GRIDGUARD — NODE-RED INGESTION & ORCHESTRATION LAYER

---

## 1. Role in System Architecture
**Node-RED** serves as the authoritative edge-to-cloud message broker gateway and protocol firewall in GRIDGUARD:
1. Subscribes securely over TLS (port 8883) to HiveMQ Cloud (`smarttransformer/*`).
2. Enforces structural schema validation and rejects malformed JSON.
3. Enforces the **Strict Zero-Temperature Policy** by inspecting all incoming payload keys and immediately discarding any packet containing `temp` or `thermal`.
4. Calculates Apparent Power in VA ($V \times I$) when raw voltages and currents are received.
5. Rejects any channel index outside the set $\{1, 2, 3, 4\}$.
6. Forwards verified packets to FastAPI ingestion endpoints via authenticated local HTTP POST.

---

## 2. Ingestion Routing Table

| Inbound Topic | Node-RED Function Node | Target FastAPI REST Endpoint |
|:---|:---|:---|
| `smarttransformer/status` | `Parse & Validate Status (Zero-Temp)` | `POST /api/telemetry/device-status` |
| `smarttransformer/heartbeat` | `Parse Heartbeat & Ping` | `POST /api/telemetry/device-status` |
| `smarttransformer/system` | `Validate System Telemetry (Zero-Temp)` | `POST /api/telemetry/system` |
| `smarttransformer/channel/+` | `Validate Channel Telemetry (Zero-Temp)` | `POST /api/telemetry/channels` |
| `smarttransformer/events` | `Process Safety & Protection Events` | `POST /api/telemetry/events` |
| `smarttransformer/faults` | `Process Latched Fault Alerts` | `POST /api/telemetry/faults` |

---

## 3. Node-RED Filter Functions

### 3.1 Strict Zero-Temperature Discard Guard
Every function node in Node-RED incorporates an invariant key audit loop:
```javascript
// Strict Zero-Temperature Policy Violation Check
for (let k in payload) {
    let lower = k.toLowerCase();
    if (lower.includes('temp') || lower.includes('thermal')) {
        node.error('Strict Zero-Temperature Policy Violation: Field "' + k + '" rejected', msg);
        return null; // Terminate execution, do not forward to FastAPI
    }
}
```

### 3.2 Channel ID Boundary Validation
```javascript
let channelNum = Number(rawCh);
if (!Number.isInteger(channelNum) || channelNum < 1 || channelNum > 4) {
    node.error('Invalid channel rejected: ' + rawCh + ' (only 1, 2, 3, 4 permitted)', msg);
    return null;
}
```

---

## 4. Flow Configuration File
The complete production flow export is maintained in:
[`nodered/flows.json`](file:///c:/Users/tejwi/OneDrive/Desktop/antigravity%20projects/database/nodered/flows.json)
