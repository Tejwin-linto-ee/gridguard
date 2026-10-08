# GRIDGUARD — Exhibition Demonstration Guide (Section 57)

This guide provides the exact 16-step demonstration script for showcasing GRIDGUARD at engineering exhibitions, technical juries, and client reviews.

---

## 16-Step Guided Demonstration Sequence

### Phase 1: Nominal Baseline Operation
- **Step 1 — System Starts NORMAL**:
  - Open SCADA dashboard at `http://localhost:3000`.
  - Observe the bulk system card showing nominal mains voltage ($230.4\text{ V}$), current ($4.21\text{ A}$), active power ($918.5\text{ W}$), frequency ($50.1\text{ Hz}$), and power factor ($0.94$).
  - Overall status badge shows `NORMAL`.
- **Step 2 — All 4 Prototype Load Channels Visible**:
  - Point to the four channel cards on the Overview or Live page.
  - Explain that each bulb represents a prototype feeder channel.
  - Point out that each branch measures $V \times I$ strictly as **Apparent Power ($VA$)**, while system active power in $W$ is measured by the PZEM-004T.
  - Highlight: `COMMANDED: CLOSED (ON) • PHYSICAL FEEDBACK: NOT AVAILABLE`.

### Phase 2: Fault Escalation on Channel 2
- **Step 3 — Initiate Load Increase**:
  - Open **Demo Simulator** (`/demo`) or engineering scenario trigger.
  - Select `LOAD_INCREASE` on Channel 2.
- **Step 4 — Channel 2 Enters WARNING**:
  - Channel 2 current rises to $2.10\text{ A}$ ($>2.00\text{A}$ limit). Status changes to amber `WARNING`.
  - Explain: System begins thermal persistence tracking; relays remain closed.
- **Step 5 — Channel 2 Enters HIGH LOAD**:
  - Trigger `OVERLOAD`. Current reaches $2.65\text{ A}$.
  - Digital Twin reflects high current flow through Channel 2.
- **Step 6 — Channel 2 Enters CRITICAL**:
  - Trigger `OVERCURRENT`. Current spikes to $3.45\text{ A}$ ($>2.50\text{A}$ critical limit).
  - Status becomes flashing red `CRITICAL`. Persistence timer ($1000\text{ ms}$) counts down.

### Phase 3: Autonomous Trip & Latch
- **Step 7 — Protection Engine Trips Channel 2**:
  - After $1000\text{ ms}$ persistence is satisfied, the ESP32-S3 Core 1 protection loop commands Main and Auxiliary relays OPEN in $<10\text{ ms}$.
  - Current drops to $0.00\text{ A}$. Channel 2 prototype bulb extinguishes.
  - System active power drops accordingly.
- **Step 8 — Channel 2 Enters FAULT LATCHED**:
  - Channel status transitions to `FAULT LATCHED`. Relays remain locked OPEN.
  - SCADA raises critical audio-visual alert and captures complete forensic snapshot.

### Phase 4: Biometric Safety Authorization
- **Step 9 — Manual Reset Attempt Rejected**:
  - Click the Channel 2 manual relay toggle.
  - The UI and API reject the action: *"Fault is latched. Safety policy prohibits manual reset without biometric authorization."*
- **Step 10 — Face Recognition Authorization Requested**:
  - Click **"AUTHORIZE RESET WITH FACE ID"** or open the **Facial Biometric Hub**.
- **Step 11 — Authorized Operator Recognized**:
  - The webcam initializes. Position your face in the HUD reticle.
  - Biometric engine confirms identity: `Lead Operator` (Confidence $>95\%$).
- **Step 12 — Automated Safety Conditions Check**:
  - Backend verifies line voltage stability ($200\text{V} \le V \le 250\text{V}$) and sensor health before allowing energization.
- **Step 13 — Channel 2 Resets**:
  - Relays close in safe sequence. Prototype bulb illuminates.
- **Step 14 — Stabilization Monitoring**:
  - System enters `STABILIZATION` for $2000\text{ ms}$, validating current returns to nominal ($1.25\text{ A}$).
- **Step 15 — System Returns to NORMAL**:
  - Status badge returns to green `NORMAL`.

### Phase 5: Forensic Proof
- **Step 16 — Review Event Timeline**:
  - Navigate to **Event Timeline** (`/timeline`).
  - Demonstrate the exact sub-second sequence:
    ```
    15:32:12 CH2 WARNING
    15:32:13 CH2 HIGH LOAD
    15:32:14 CH2 CRITICAL
    15:32:15 CH2 TRIPPED
    15:32:16 FAULT LATCHED
    15:33:01 RESET REQUEST
    15:33:03 FACE AUTHORIZED
    15:33:05 CH2 RESET
    ```
  - Show that every state transition, identity verification, and relay command is permanently recorded in the immutable audit log.
