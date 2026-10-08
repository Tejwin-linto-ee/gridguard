# GRIDGUARD Biometric Face Verification Specification

## 1. Overview

The biometric verification pipeline is executed whenever an operator requests the de-latching and unlatching of a tripped transformer/load channel. Verification answers two distinct questions:
1. **Is the subject a living human being physically present before the camera?** (Liveness / Anti-Spoofing)
2. **Does the subject's face match an authorized and active operator enrolled in the system?** (Identity Matching & RBAC)

---

## 2. Verification Protocol Flow

```
OPERATOR ACTION: Clicks [ REQUEST AUTHORIZED RESET ]
    │
    ▼
POST /api/face/verification/start
    ├── Binds request_id to channel_id and current fault_id
    └── Returns active session token with 5-minute expiry
    │
    ▼
IN-BROWSER CAMERA ACQUISITION
    ├── FaceCamera streams live 640x480 video
    ├── Periodically captures frames (400ms interval)
    └── Sends POST /api/face/verification/verify-frame for real-time HUD telemetry
    │
    ▼
HUD REAL-TIME GUIDANCE (Client-side display):
    ├── Single Face Detection Check: (N=0: "NO_FACE_DETECTED", N>1: "MULTIPLE_FACES_DETECTED")
    ├── Pose Alignment Guidance: ("MOVE_CLOSER", "MOVE_BACK", "MOVE_LEFT", "MOVE_RIGHT", "LOOK_AT_CAMERA")
    └── Quality Telemetry Pill: (Sharpness, Contrast, Luminance)
    │
    ▼
FINAL VERIFICATION SUBMISSION
    └── POST /api/face/verification/complete (Submits 3 sequential high-quality frames)
    │
    ▼
BACKEND PIPELINE EXECUTION (Services/Face_Auth):
    ├── 1. Detector: Confirms single face in all submitted frames
    ├── 2. Quality Check: Average quality >= 0.70
    ├── 3. Liveness Analysis: Average liveness score >= 0.75 across frames
    ├── 4. Embedding Generation: 512-D L2-normalized vector extraction
    ├── 5. Centroid Matching: Cosine similarity vs active enrolled operators
    │      threshold >= 0.78 (calibrated for FAR <= 0.001)
    ├── 6. RBAC Policy Check: Matched user must have role in ['OPERATOR', 'ADMIN'] and status == 'ACTIVE'
    └── 7. Rate Limiting Check: Failures < 5 within 10-minute sliding window
    │
    ▼
DECISION FORK:
    ├── MATCH FAILED / SPOOF DETECTED:
    │   └── Returns decision = 'DENIED', records attempt in audit log, FAULT REMAINS LATCHED.
    │
    └── MATCH SUCCESSFUL:
        ├── Returns decision = 'AUTHORIZED'
        ├── Generates single-use cryptographic token: reset_authorization_token (60s TTL)
        └── Client proceeds to Pre-Closure Safety Validation step.
```

---

## 3. Disaggregated Scoring Model (No Magic Percentages)

GRIDGUARD strictly avoids deceptive single-percentage figures (such as "99.9% accurate"). The user and audit interfaces present isolated, verifiable metrics:

| Metric | Measured Scale | Minimum Acceptance Threshold | Description |
|---|---|---|---|
| **Face Match (Similarity)** | $0.000 - 1.000$ | $\ge 0.780$ | Cosine similarity between live vector and enrolled centroid. |
| **Liveness Score** | $0.000 - 1.000$ | $\ge 0.750$ | Spectral FFT frequency domain & chrominance anti-spoof confidence. |
| **Face Quality Score** | $0.000 - 1.000$ | $\ge 0.700$ | Composite score of sharpness, contrast, lighting, and pose alignment. |
| **Pre-Closure Safety** | `PASSED` / `BLOCKED` | Binary Safe | Active voltage ($200\text{V} - 250\text{V}$) & cleared overcurrent ($I < 2.50\text{A}$). |
