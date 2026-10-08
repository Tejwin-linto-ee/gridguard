# GRIDGUARD — Cybersecurity & Access Control Architecture

## 1. Role-Based Access Control (RBAC) (Section 26)

The platform enforces three distinct user roles with strict privilege separation:

| Role | Monitoring | Relay Manual Switching | Face Reset Auth | Threshold Config | Sensor Calibration | User Admin |
|---|---|---|---|---|---|---|
| **ADMIN** | Full | Allowed | Allowed | Allowed | Allowed | Allowed |
| **OPERATOR** | Full | Allowed | Allowed | Read Only | Auto-Zero Only | Blocked |
| **VIEWER** | Full | Blocked | Blocked | Read Only | Read Only | Blocked |

---

## 2. Authentication & Cryptographic Standards
- **Password Hashing**: Passwords are encrypted using **PBKDF2-SHA256** with 100,000 iterations and cryptographic salt.
- **Session Tokens**: REST endpoints authenticate via **JSON Web Tokens (JWT)** with HMAC-SHA256 signing and expiration validation.
- **MQTT Transport Security**: Private HiveMQ Cloud broker uses **TLS/SSL encryption** on port 8883 with client username/password authentication.
- **Secret Hygiene**: Zero API keys or credentials exist in frontend JavaScript bundles or repository source code. Secrets are injected via `.env`.

---

## 3. Facial Biometric Reset Safety Gate (Section 25)

Biometric face recognition serves strictly as an **authorization gate** to prevent unauthorized unlatching of tripped breakers:

```
FAULT OCCURS ➔ HARDWARE TRIPS ➔ FAULT LATCHED
                       │
                       ▼
          RESET INITIATION REQUEST
                       │
                       ▼
          WEBCAM HUD INITIALIZATION
                       │
                       ▼
      FACE DETECTION & EMBEDDING EXTRACTION
                       │
                       ▼
        OPERATOR IDENTITY MATCH (>= 75%)
            ├── FAIL ➔ MAINTAIN LATCH + AUDIT FAILED ATTEMPT + RATE LIMIT
            └── PASS ➔ CHECK ELECTRICAL SAFETY (200V - 250V)
                            ├── UNSAFE ➔ REJECT CLOSURE
                            └── SAFE   ➔ CLOSE RELAYS & ENTER STABILIZATION
```

---

## 4. Immutable Audit Trail (Section 27)
Every operational action is permanently logged into the PostgreSQL `system_events` table:
- User login / logout / failed login
- Protection threshold updates (recording old vs new values)
- Sensor calibration changes (recording scales, offsets, references)
- Manual relay commands
- Fault trips and auto-latches
- Biometric reset attempts (successful and failed)
- Priority load-shedding triggers and restorations
- AI supervisory queries
