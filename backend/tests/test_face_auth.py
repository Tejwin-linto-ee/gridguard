import pytest
import asyncio
import base64
import cv2
import numpy as np
from httpx import AsyncClient, ASGITransport
from backend.app.main import app


def generate_synthetic_face_frame(brightness: int = 140, add_eyes: bool = True) -> str:
    """Generates an authentic synthetic face pattern with oval head, eyes, and mouth for testing."""
    img = np.full((480, 640, 3), brightness, dtype=np.uint8)
    # Head outline (oval)
    cv2.ellipse(img, (320, 240), (100, 130), 0, 0, 360, (180, 200, 230), -1)
    cv2.ellipse(img, (320, 240), (100, 130), 0, 0, 360, (50, 50, 50), 2)

    if add_eyes:
        # Left eye
        cv2.circle(img, (280, 210), 12, (255, 255, 255), -1)
        cv2.circle(img, (280, 210), 6, (30, 30, 30), -1)
        # Right eye
        cv2.circle(img, (360, 210), 12, (255, 255, 255), -1)
        cv2.circle(img, (360, 210), 6, (30, 30, 30), -1)
        # Eyebrows
        cv2.line(img, (265, 195), (295, 195), (30, 30, 30), 3)
        cv2.line(img, (345, 195), (375, 195), (30, 30, 30), 3)

    # Nose
    cv2.line(img, (320, 220), (320, 250), (120, 140, 160), 2)
    # Mouth
    cv2.ellipse(img, (320, 280), (30, 12), 0, 0, 180, (40, 40, 180), 3)

    _, buf = cv2.imencode(".jpg", img)
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

def generate_blank_frame() -> str:
    """Generates a plain black frame with no face."""
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

@pytest.mark.asyncio
async def test_face_verification_session_lifecycle():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Start verification session bound to Channel 2
        start_payload = {
            "channel_id": 2,
            "fault_id": "FLT-TEST-02",
            "requested_by": "Senior Protection Operator"
        }
        res_start = await ac.post("/api/face/verification/start", json=start_payload)
        assert res_start.status_code == 200
        data = res_start.json()
        assert "request_id" in data
        assert data["channel_id"] == 2
        assert data["fault_id"] == "FLT-TEST-02"
        assert "session_nonce" in data
        request_id = data["request_id"]

        # 2. Test single-frame feedback with no face
        blank_frame = generate_blank_frame()
        res_blank = await ac.post("/api/face/verification/verify-frame", json={"frame_base64": blank_frame})
        assert res_blank.status_code == 200
        fb_blank = res_blank.json()
        assert fb_blank["face_detected"] is False
        assert fb_blank["face_count"] == 0

        # 3. Test single-frame feedback with synthetic face
        face_frame = generate_synthetic_face_frame()
        res_face = await ac.post("/api/face/verification/verify-frame", json={"frame_base64": face_frame})
        assert res_face.status_code == 200
        fb_face = res_face.json()
        # Should return structured quality metrics
        assert "quality_score" in fb_face
        assert "guidance" in fb_face

@pytest.mark.asyncio
async def test_biometric_reset_authorization_and_token_burning():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Initiate session for Channel 3
        res_start = await ac.post("/api/face/verification/start", json={"channel_id": 3, "fault_id": "OVERCURRENT"})
        assert res_start.status_code == 200
        req_id = res_start.json()["request_id"]

        # 2. Complete verification using multi-frame temporal stream
        frames = [
            generate_synthetic_face_frame(brightness=140),
            generate_synthetic_face_frame(brightness=142),
            generate_synthetic_face_frame(brightness=139)
        ]
        complete_payload = {
            "request_id": req_id,
            "frames_base64": frames,
            "client_session_id": "test-session-01"
        }
        res_comp = await ac.post("/api/face/verification/complete", json=complete_payload)
        assert res_comp.status_code == 200
        comp_data = res_comp.json()
        assert "attempt_id" in comp_data
        assert "decision" in comp_data
        assert "similarity_score" in comp_data
        assert "liveness_score" in comp_data

        # 3. Verify that an issued token is single-use and burns immediately
        from backend.app.services.face_auth import reset_policy_engine
        token, meta = reset_policy_engine.generate_reset_token(
            user_id="OP-LEAD-01",
            channel_id=3,
            fault_id="OVERCURRENT",
            attempt_id="ATT-TEST-01"
        )

        # 4. Pre-closure safety check
        res_safety = await ac.post("/api/reset/authorize", json={
            "reset_authorization_token": token,
            "channel_id": 3,
            "fault_id": "OVERCURRENT"
        })
        assert res_safety.status_code == 200
        assert res_safety.json()["safety_passed"] is True

        # 5. Execute reset
        res_exec = await ac.post("/api/reset/execute", json={
            "reset_authorization_token": token,
            "channel_id": 3
        })
        assert res_exec.status_code == 200
        assert res_exec.json()["success"] is True
        assert res_exec.json()["restored_status"] == "NORMAL"

        # 6. Anti-Replay: Attempt to re-use burned token -> Must fail closed
        res_replay = await ac.post("/api/reset/execute", json={
            "reset_authorization_token": token,
            "channel_id": 3
        })
        assert res_replay.status_code == 400
        assert "TOKEN" in res_replay.json()["detail"] or "INVALID" in res_replay.json()["detail"]

@pytest.mark.asyncio
async def test_safety_check_blocks_reset_when_protection_active():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        from backend.app.services.face_auth import reset_policy_engine
        from backend.app.api.endpoints import current_channels_state

        token, _ = reset_policy_engine.generate_reset_token(
            user_id="OP-LEAD-01",
            channel_id=2,
            fault_id="OVERCURRENT",
            attempt_id="ATT-SAFETY-01"
        )

        # Simulate persistent dangerous overcurrent condition on Channel 2
        original_current = current_channels_state[2]["current"]
        current_channels_state[2]["current"] = 3.85 # Well above 2.50A critical threshold

        try:
            res_safety = await ac.post("/api/reset/authorize", json={
                "reset_authorization_token": token,
                "channel_id": 2,
                "fault_id": "OVERCURRENT"
            })
            assert res_safety.status_code == 200
            safety_data = res_safety.json()
            # Identity is authorized, BUT reset is blocked!
            assert safety_data["authorized"] is True
            assert safety_data["safety_passed"] is False
            assert safety_data["status"] == "SAFETY_CHECK_FAILED"
            assert "RESET BLOCKED" in safety_data["message"]
        finally:
            current_channels_state[2]["current"] = original_current

@pytest.mark.asyncio
async def test_rate_limiting_lockout_after_repeated_failures():
    from backend.app.services.face_auth import reset_policy_engine
    test_key = "RATE_LIMIT_TEST_KEY"

    # Reset any previous state for key
    reset_policy_engine.record_success(test_key)

    # Trigger 4 failures -> Should still be allowed
    for _ in range(4):
        locked = reset_policy_engine.record_failure(test_key)
        assert locked is False
        allowed, _ = reset_policy_engine.check_rate_limit(test_key)
        assert allowed is True

    # 5th failure -> Triggers security lockout
    locked = reset_policy_engine.record_failure(test_key)
    assert locked is True
    allowed, err_msg = reset_policy_engine.check_rate_limit(test_key)
    assert allowed is False
    assert "TOO_MANY_FAILED_ATTEMPTS" in err_msg

    # Cleanup
    reset_policy_engine.record_success(test_key)

@pytest.mark.asyncio
async def test_biometric_user_management_and_audit():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Fetch enrolled biometric users
        await ac.post("/api/face/users/OP-LEAD-01/enable")
        res_users = await ac.get("/api/face/users")
        assert res_users.status_code == 200
        users = res_users.json()
        assert len(users) >= 1
        lead_op = next((u for u in users if u["user_id"] == "OP-LEAD-01"), None)
        assert lead_op is not None
        assert lead_op["role"] == "OPERATOR"
        assert lead_op["status"] == "ACTIVE"

        # 2. Fetch biometric audit log
        res_audit = await ac.get("/api/face/audit?limit=10")
        assert res_audit.status_code == 200
        audit_logs = res_audit.json()
        assert isinstance(audit_logs, list)

        # 3. Disable user
        res_dis = await ac.post("/api/face/users/OP-LEAD-01/disable")
        assert res_dis.status_code == 200
        assert res_dis.json()["status"] == "DISABLED"

        # 4. Verify disabled status reflected in list
        res_users2 = await ac.get("/api/face/users")
        u2 = next(u for u in res_users2.json() if u["user_id"] == "OP-LEAD-01")
        assert u2["status"] == "DISABLED"

        # 5. Restore active status
        res_en = await ac.post("/api/face/users/OP-LEAD-01/enable")
        assert res_en.status_code == 200
        assert res_en.json()["status"] == "ACTIVE"

@pytest.mark.asyncio
async def test_guided_sample_validation_and_rejection():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Blank frame should be rejected
        blank = generate_blank_frame()
        res_blank = await ac.post("/api/face/enrollment/validate-sample", json={"frame_base64": blank, "sample_step": 1})
        assert res_blank.status_code == 200
        data_blank = res_blank.json()
        assert data_blank["accepted"] is False
        assert data_blank["reason"] == "NO_FACE"

        # 2. Synthetic authentic face frame should pass sample validation
        face = generate_synthetic_face_frame()
        res_face = await ac.post("/api/face/enrollment/validate-sample", json={"frame_base64": face, "sample_step": 1})
        assert res_face.status_code == 200
        data_face = res_face.json()
        assert data_face["accepted"] is True
        assert data_face["reason"] == "CAPTURE_ACCEPTED"
        assert "quality_score" in data_face
        assert "metrics" in data_face

@pytest.mark.asyncio
async def test_five_sample_enrollment_centroid_synthesis_and_outlier_rejection():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Five consistent sample frames
        frames = [
            generate_synthetic_face_frame(brightness=140),
            generate_synthetic_face_frame(brightness=142),
            generate_synthetic_face_frame(brightness=139),
            generate_synthetic_face_frame(brightness=141),
            generate_synthetic_face_frame(brightness=140),
        ]
        enroll_payload = {
            "user_id": "OP-TEST-REAL-01",
            "display_name": "Test Real Operator",
            "role": "OPERATOR",
            "frames_base64": frames
        }
        res_enr = await ac.post("/api/face/enrollment/verify", json=enroll_payload)
        assert res_enr.status_code == 200
        data_enr = res_enr.json()
        assert data_enr["success"] is True
        assert data_enr["user_id"] == "OP-TEST-REAL-01"
        assert data_enr["sample_count"] == 5
        assert data_enr["status"] == "ACTIVE"
        assert data_enr["consistency_score"] >= 0.70
        assert data_enr["enrollment_quality"] == "GOOD"
        assert data_enr["model_version"] == "facenet512-l2norm-centroid"

        # 2. Verify re-enrollment increments version without error
        res_reenr = await ac.post("/api/face/enrollment/verify", json=enroll_payload)
        assert res_reenr.status_code == 200
        assert res_reenr.json()["enrollment_version"] >= 2

@pytest.mark.asyncio
async def test_anti_spoof_benchmark_evaluation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Real face sequential frames (with micro-variance)
        frames_real = [
            generate_synthetic_face_frame(brightness=140),
            generate_synthetic_face_frame(brightness=142),
            generate_synthetic_face_frame(brightness=139)
        ]
        res_real = await ac.post("/api/face/anti-spoof/evaluate", json={
            "frames_base64": frames_real,
            "claimed_type": "REAL_FACE"
        })
        assert res_real.status_code == 200
        assert res_real.json()["actual_pass"] is True
        assert res_real.json()["test_success"] is True

        # 2. Static photo spoof (identical identical frames -> zero temporal variance MAD < 0.4)
        identical_frame = generate_synthetic_face_frame(brightness=140)
        frames_photo = [identical_frame, identical_frame, identical_frame]
        res_photo = await ac.post("/api/face/anti-spoof/evaluate", json={
            "frames_base64": frames_photo,
            "claimed_type": "PHOTO"
        })
        assert res_photo.status_code == 200
        data_photo = res_photo.json()
        # Photo must FAIL liveness check!
        assert data_photo["actual_pass"] is False
        assert data_photo["test_success"] is True
        assert "STATIC_PHOTO" in data_photo["detected_attack"] or data_photo["liveness_score"] < 0.75

@pytest.mark.asyncio
async def test_disabled_user_identity_rejection_at_reset_gate():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Disable the test user
        await ac.post("/api/face/users/OP-TEST-REAL-01/disable")

        # 2. Start reset verification session
        res_start = await ac.post("/api/face/verification/start", json={"channel_id": 1, "fault_id": "OVERCURRENT"})
        req_id = res_start.json()["request_id"]

        # 3. Attempt verification with frames matching OP-TEST-REAL-01
        frames = [
            generate_synthetic_face_frame(brightness=140),
            generate_synthetic_face_frame(brightness=142),
            generate_synthetic_face_frame(brightness=139)
        ]
        res_comp = await ac.post("/api/face/verification/complete", json={
            "request_id": req_id,
            "frames_base64": frames
        })
        assert res_comp.status_code == 200
        data_comp = res_comp.json()
        # MUST BE DENIED due to ACCOUNT_DISABLED!
        assert data_comp["authorized"] is False
        assert "ACCOUNT_DISABLED" in (data_comp.get("failure_reason") or "")

@pytest.mark.asyncio
async def test_token_race_condition_and_double_spend_protection():
    """
    Section 24: Token Race Condition Test.
    Sends two reset execution requests simultaneously using the same one-time token.
    Exactly one must succeed (200), and the second must be rejected (400) due to atomic lock.
    """
    from backend.app.services.face_auth import reset_policy_engine
    token, meta = reset_policy_engine.generate_reset_token(
        user_id="OP-LEAD-01",
        channel_id=2,
        fault_id="FLT-RACE-001",
        attempt_id="ATT-RACE-001"
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        req_payload = {
            "reset_authorization_token": token,
            "channel_id": 2
        }

        # Send concurrent requests at the exact same instant
        res1, res2 = await asyncio.gather(
            ac.post("/api/reset/execute", json=req_payload),
            ac.post("/api/reset/execute", json=req_payload)
        )

        statuses = [res1.status_code, res2.status_code]
        # Exactly one must succeed (200), and one must fail (400)
        assert 200 in statuses, f"Neither request succeeded: {statuses}"
        assert 400 in statuses, f"Both requests succeeded (Race condition bug!): {statuses}"

        # Inspect failure message
        failed_res = res1 if res1.status_code == 400 else res2
        assert "TOKEN_ALREADY_USED" in failed_res.text or "INVALID_TOKEN" in failed_res.text

@pytest.mark.asyncio
async def test_unauthorized_role_rejection_at_reset():
    """
    Section 36 & 38: Role-based authorization test.
    VIEWER accounts must never be allowed to execute reset commands.
    """
    from backend.app.services.face_auth import reset_policy_engine
    allowed, err = reset_policy_engine.evaluate_rbac("VIEWER", "ACTIVE")
    assert allowed is False
    assert "INSUFFICIENT_ROLE" in err

    # Operator and Admin must be allowed
    op_ok, _ = reset_policy_engine.evaluate_rbac("OPERATOR", "ACTIVE")
    admin_ok, _ = reset_policy_engine.evaluate_rbac("ADMIN", "ACTIVE")
    assert op_ok is True
    assert admin_ok is True

@pytest.mark.asyncio
async def test_threshold_governance_and_audit():
    """
    Section 6: Configurable, versioned, audited operating threshold.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Fetch current threshold
        res_t = await ac.get("/api/face/threshold")
        assert res_t.status_code == 200
        cur_data = res_t.json()
        assert "current_threshold" in cur_data
        assert "threshold_version" in cur_data

        # 2. Update threshold with administrative reason
        up_payload = {
            "threshold": 0.815,
            "reason": "Calibrated from control-room operational benchmark"
        }
        res_up = await ac.post("/api/face/threshold", json=up_payload)
        assert res_up.status_code == 200
        up_data = res_up.json()
        assert up_data["current_threshold"] == 0.815
        assert up_data["status"] == "UPDATED"

        # 3. Verify metrics endpoint reflects updated threshold
        res_m = await ac.get("/api/face/metrics")
        assert res_m.status_code == 200
        assert res_m.json()["current_threshold"] == 0.815

@pytest.mark.asyncio
async def test_reset_forensic_timeline_endpoint():
    """
    Section 42 & 43: Reset Forensic Timeline correlation trace.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/face/forensics/CORR-CH2-TEST")
        assert res.status_code == 200
        data = res.json()
        assert data["correlation_id"] == "CORR-CH2-TEST"
        assert "timeline" in data




