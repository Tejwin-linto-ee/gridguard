# GRIDGUARD Biometric Security & Cryptographic Policy

## 1. Zero Trust Architectural Principles

GRIDGUARD treats the web browser, local camera device, and intermediate network as potentially hostile environments. Security is established through explicit defense-in-depth boundaries:

1. **Frontend Cannot Authorize**: The browser never generates, decides, or modifies authorization decisions (`authorized=true` sent from a client is ignored).
2. **Fail-Closed Default**: In any anomalous circumstance (camera dropout, model missing, lighting degraded, multiple persons visible, network timeout, active electrical hazard), the system defaults to `DENIED` and preserves the latched relay state.
3. **No Direct Browser-to-Relay Bridge**: A successful face match does not directly trigger hardware GPIOs. Authorization merely issues a short-lived cryptographic capability token.

---

## 2. Cryptographic Reset Token Lifecycle

To prevent replay, request tampering, and race conditions, the backend issues single-use authorization tokens:

```
[ FACE AUTH ENGINE ] ─── Validated ───▶ Generates: secrets.token_urlsafe(32)
                                                │
                                                ▼
                                    Compute: SHA-256(Token)
                                                │
                                                ▼
                                    Store in DB & Memory:
                                    - token_hash: SHA-256 hex string
                                    - channel_id: Specific channel (e.g. CH2)
                                    - fault_id: Bound fault event UUID
                                    - user_id: Authenticated operator ID
                                    - expires_at: now() + 60 seconds
                                    - status: "ACTIVE"
                                                │
                                                ▼
[ WEBPAGE CLIENT ] ◀── Transmit Plaintext Token Over TLS (Single use only)
        │
        │ Operator reviews Pre-Closure Safety Diagnostics
        ▼
POST /api/reset/execute (token, channel_id)
        │
        ├── 1. Compute SHA-256(incoming_token)
        ├── 2. Verify hash exists and status == "ACTIVE"
        ├── 3. Verify current_time < expires_at
        ├── 4. Verify channel_id matches bound token channel
        ├── 5. BURN TOKEN: Set status = "BURNED", used_at = now()
        │      (Future calls with this token immediately fail with HTTP 400)
        ├── 6. Validate electrical pre-closure safety
        └── 7. Dispatch authenticated MQTT reset command to ESP32-S3
```

---

## 3. Rate Limiting & Denial-of-Service Defense

To protect against brute-force presentation attacks or automated camera frame injection:
- **Maximum Consecutive Failures**: 5 failed verification attempts within a 10-minute window.
- **Lockout Mechanism**: Once exceeded, the requested channel and client session are placed in a **15-minute security lockout**.
- **Audit Logging**: Every rate-limit lockout generates an immediate high-severity security event logged in `system_events` and visible on the SCADA audit log.
- **Cooldown Display**: The UI displays `SECURITY LOCKOUT: TOO MANY FAILED ATTEMPTS` with a live cooldown timer.

---

## 4. Role-Based Access Control (RBAC) Matrix

Biometric verification proves *identity*; RBAC dictates *privilege*:

| Role | Telemetry Monitoring | Biometric Enrollment | Fault Trip Reset | System Calibration |
|---|---|---|---|---|
| **VIEWER** | Allowed | Denied | **Denied** (HTTP 403) | Denied |
| **OPERATOR** | Allowed | Denied | **Allowed** (Pending Verification) | Denied |
| **ADMIN** | Allowed | **Allowed** | **Allowed** (Pending Verification) | **Allowed** |

If an enrolled user exists in the biometric database but has their status changed to `DISABLED`, any verification attempt produces `FACE MATCH: YES` but `AUTHORIZATION: DENIED (ACCOUNT DISABLED)`.
