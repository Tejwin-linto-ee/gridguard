# GRIDGUARD Biometric Face Authentication Architecture

## 1. Executive Summary & Security Boundary Principle

In the **GRIDGUARD Smart Transformer Protection & Assistive Load Device** system, biometric face verification operates strictly as an **AUTHORIZATION LAYER** and **NEVER as the primary electrical protection mechanism**.

### The Inviolable Protection Hierarchy:
```
LOCAL ESP32-S3 PROTECTION (Hardware Current/Voltage Sampling)
        ↓
FAULT TRIP & RELAY LATCH (Sub-millisecond Interrupt De-energization)
        ↓
RESET REQUEST (Web SCADA Operator Interaction)
        ↓
IN-BROWSER FACE VERIFICATION (navigator.mediaDevices.getUserMedia)
        ↓
MULTI-FRAME LIVENESS / ANTI-SPOOF CHECK (Spectral + Chrominance)
        ↓
512-D FACENET512 EMBEDDING EXTRACTION & CENTROID MATCHING
        ↓
RBAC ROLE AUTHORIZATION (ADMIN / OPERATOR Clearance)
        ↓
CRYPTOGRAPHIC ONE-TIME RESET TOKEN (60s Expiration)
        ↓
ELECTRICAL PRE-CLOSURE SAFETY CHECK (V, I Within Safe Envelopes)
        ↓
MQTT DISPATCH TO ESP32-S3 FIRMWARE
        ↓
LOCAL FIRMWARE SAFETY VALIDATION (Hardware ADC Sanity)
        ↓
RELAY CLOSURE (Main Relay → Aux Relay Staggered Closure)
        ↓
STABILIZATION & CONTINUOUS RETRIP MONITORING
```

---

## 2. In-Browser Only Camera Constraint

GRIDGUARD forbids external desktop applications, Windows Camera popups, or OpenCV GUI windows.
- The video stream is strictly bound to the browser DOM via `navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })`.
- Streams are contained within high-performance `<video>` elements rendered in industrial SCADA modals (`FaceVerificationModal`, `FaceEnrollmentModal`).
- All media tracks are actively stopped and released immediately when the modal closes, cancels, completes, or if the user navigates away.

---

## 3. Subsystem Component Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        GRIDGUARD WEB SCADA (Next.js)                  │
│                                                                        │
│   ┌───────────────────────────┐        ┌───────────────────────────┐   │
│   │   FaceCamera Component    │        │  FaceVerificationModal    │   │
│   │   - getUserMedia() preview│───────▶│  - Industrial Reticle HUD │   │
│   │   - Frame sampling (400ms)│        │  - Quality & Pose Badges  │   │
│   │   - Active stream cleanup │        │  - Score Telemetry Bar    │   │
│   └───────────────────────────┘        └─────────────┬─────────────┘   │
└──────────────────────────────────────────────────────┼─────────────────┘
                                                       │ HTTPS / POST
                                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   FASTAPI AUTHORITATIVE BACKEND ENGINE                 │
│                                                                        │
│   /services/face_auth/                                                 │
│   ├── detector.py      -> Single-face constraint (N=1, Haar/YuNet)     │
│   ├── quality.py       -> Laplacian blur, contrast, centering, pose    │
│   ├── liveness.py      -> Multi-frame 2D FFT Moire & YCrCb chrominance │
│   ├── embedding.py     -> 512-D FaceNet512 L2-normalized vector        │
│   ├── matcher.py       -> Cosine similarity (threshold >= 0.78)        │
│   ├── policy.py        -> RBAC, rate-limiting lockout, token burning   │
│   ├── enrollment.py    -> Multi-frame centroid generation & storage    │
│   └── verification.py  -> Multi-stage pipeline orchestrator            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         SQLite (gridguard.db)
               ├── biometric_users
               ├── biometric_enrollments
               ├── biometric_verification_attempts
               ├── reset_requests
               └── reset_authorizations
                                    │
                               MQTT │ (TLS / Authenticated)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               ESP32-S3 DUAL-CORE PROTECTION CONTROLLER                 │
│                                                                        │
│   - Receives topic: smarttransformer/commands (RESET_LATCH)            │
│   - Validates local ACS712 current & ZMPT101B voltage thresholds      │
│   - Executes staggered relay energization (GPIO18 / GPIO19)            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Server-Authoritative Decision Rules

1. The frontend browser is strictly a presentation and frame-capture surface.
2. The browser is **never trusted** to evaluate or decide authorization.
3. Every verification attempt produces an immutable record in `biometric_verification_attempts` with individual metric scores:
   - `quality_score` ($\ge 0.70$)
   - `liveness_score` ($\ge 0.75$)
   - `similarity_score` ($\ge 0.78$)
4. If any single stage fails, the engine **fails closed**: the reset token is withheld and the channel relay remains de-energized.

---

## 5. Security Protocols & Operational Sequencing

### 5.1 Universal Correlation ID Tracking
Every fault reset lifecycle is bound to a shared cryptographic correlation ID:
`CORR-CH{channel_id}-{hex8}`
This identifier is logged across:
- Web SCADA frontend state
- Backend FastAPI reset sessions and token metadata
- SQLite audit records (`biometric_verification_attempts`, `system_events`)
- MQTT command payloads
- ESP32 hardware serial and acknowledgment messages

### 5.2 Structured Command Invariant
The MQTT bus never accepts arbitrary `reset=true` messages. It enforces structured schemas:
```json
{
  "command": "RESET_REQUEST",
  "channel": 2,
  "fault_id": "FLT-UUID",
  "authorization_id": "HASH16",
  "nonce": "NONCE16",
  "correlation_id": "CORR-CH2-A1B2C3D4",
  "authorized_by": "OP-LEAD-01",
  "relay_stagger_delay_ms": 250,
  "timestamp": "2026-09-18T11:15:00Z"
}
```

### 5.3 Staggered Relay Reset & Stabilization Progression
```
[FAULT LATCHED] 
       ↓
[RESETTING]     (Main Relay closed to establish primary continuity)
       ↓
[STABILIZING]   (250ms delay for inrush current settling)
       ↓
[MONITORING]    (Auxiliary Relay closed; continuous ADC sampling active)
       ↓
[NORMAL]  or  [RETRIPPED] (if current spikes above overcurrent boundary)
```

---

## 6. Official Biometric Project Claim

> **GRIDGUARD implements a multi-stage biometric authorization pipeline combining face detection, face-quality assessment, liveness/anti-spoofing, 512-dimensional face embeddings, identity verification, RBAC, single-use reset authorization, and local ESP32 safety validation.**

