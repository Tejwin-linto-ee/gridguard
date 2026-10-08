# GRIDGUARD Biometric Face Enrollment Specification

## 1. Overview & Policy Constraints

Biometric enrollment binds an operator's physical identity to their SCADA Role-Based Access Control (RBAC) privileges.
In accordance with production security standards:
- Only an active **ADMIN** user session may enroll or revoke operators.
- Single photograph uploads (e.g., JPEG/PNG upload forms) are **strictly forbidden** to prevent spoofed proxy enrollments.
- Enrollment requires **live in-browser multi-frame capture** ($N \ge 5$ sequential validated frames) with real-time liveness verification.

---

## 2. Multi-Stage Enrollment Pipeline

```
1. ADMIN AUTHENTICATION
   └── Validates Administrator session privileges in SCADA dashboard.

2. OPERATOR METADATA INGESTION
   ├── user_id: Unique badge or employee ID (e.g., OP-CH-02)
   ├── display_name: Full legal/operational name (e.g., Dr. Sarah Jenkins)
   └── role: OPERATOR (Fault reset scope) or ADMIN (Full system scope)

3. LIVE BROWSER CAMERA ACQUISITION
   └── navigator.mediaDevices.getUserMedia initializes preview within FaceEnrollmentModal.

4. AUTOMATED FRAME QUALITY GATE
   For each incoming video frame (sampled at 400ms):
   ├── Face Detection: Exactly one face present (N=1)
   ├── Centering & Size: Bounding box spans 20% - 65% of frame area
   ├── Sharpness: Laplacian variance >= 50.0
   ├── Lighting: Mean luminance between 60.0 and 200.0, contrast std >= 30.0
   └── Alignment: Head yaw/pitch within +/- 15 degrees

5. MULTI-SAMPLE CENTROID SYNTHESIS
   ├── Collect 5 distinct, high-quality valid frames
   ├── Extract 512-D L2-normalized vector for each frame: e_1, e_2, e_3, e_4, e_5
   ├── Compute centroid vector: c = (1/5) * sum(e_i)
   └── Re-normalize centroid: c_final = c / ||c||_2

6. DATABASE COMMITMENT & AUDITING
   ├── Insert or update `biometric_users` record
   ├── Insert active enrollment record in `biometric_enrollments` with `embedding_blob`
   ├── Invalidate any previous enrollment version (increment enrollment_version)
   └── Log administrative audit event into `system_events`
```

---

## 3. Data Minimization & Privacy Protection

1. **Transient Frame Processing**: Camera frames streamed during enrollment are processed in memory and discarded immediately after vector centroid synthesis. Raw video is never stored on disk.
2. **Encrypted Blob Storage**: Embeddings are stored as serialized floating-point byte arrays (`embedding_blob`), preventing casual inspection or reconstruction.
3. **Auditability**: Every enrollment, re-enrollment, or disablement records the administrator's identity and timestamp.
