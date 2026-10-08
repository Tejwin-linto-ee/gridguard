import pytest
import os
import base64
import cv2
import numpy as np
from httpx import AsyncClient, ASGITransport
from backend.app.main import app

def generate_face_frame(brightness: int = 140, micro_shift: int = 0, backlit: bool = False) -> str:
    """Generates an authentic synthetic face with controlled lighting and micro-movement."""
    img = np.full((480, 640, 3), brightness, dtype=np.uint8)
    
    if backlit:
        # Bright window light along top and sides
        img[0:100, :] = 245
        img[380:, :] = 245
        img[:, 0:180] = 245
        img[:, 460:] = 245

    center_x = 320
    center_y = 240
    
    # Head outline (oval)
    cv2.ellipse(img, (center_x, center_y), (100, 130), 0, 0, 360, (180, 200, 230), -1)
    cv2.ellipse(img, (center_x, center_y), (100, 130), 0, 0, 360, (50, 50, 50), 2)

    # Eyes
    left_eye_x = center_x - 40
    right_eye_x = center_x + 40
    cv2.circle(img, (left_eye_x, center_y - 30), 12, (255, 255, 255), -1)
    cv2.circle(img, (left_eye_x, center_y - 30), 6, (30, 30, 30), -1)
    cv2.circle(img, (right_eye_x, center_y - 30), 12, (255, 255, 255), -1)
    cv2.circle(img, (right_eye_x, center_y - 30), 6, (30, 30, 30), -1)

    # Eyebrows
    cv2.line(img, (left_eye_x - 15, center_y - 45), (left_eye_x + 15, center_y - 45), (30, 30, 30), 3)
    cv2.line(img, (right_eye_x - 15, center_y - 45), (right_eye_x + 15, center_y - 45), (30, 30, 30), 3)

    # Nose
    cv2.line(img, (center_x, center_y - 20), (center_x, center_y + 10), (120, 140, 160), 2)
    # Mouth
    cv2.ellipse(img, (center_x, center_y + 40), (30, 12), 0, 0, 180, (40, 40, 180), 3)

    if micro_shift != 0:
        img = np.roll(img, micro_shift, axis=1)

    _, buf = cv2.imencode(".jpg", img)
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

@pytest.mark.asyncio
async def test_enrollment_session_challenge_lifecycle():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Start enrollment session
        res = await ac.post("/api/face/enrollment/session/start", json={
            "user_id": "OP-DEV-01",
            "display_name": "Dev Operator",
            "role": "OPERATOR"
        })
        assert res.status_code == 200
        data = res.json()
        assert "session_id" in data
        assert data["session_id"].startswith("ENR-")
        assert data["total_steps"] == 5
        assert data["current_step"] == 1
        assert "step_target" in data

@pytest.mark.asyncio
async def test_multi_frame_temporal_enrollment_sample_validation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Generate 10 consecutive frames with natural living micro-variation
        frames = [
            generate_face_frame(brightness=140, micro_shift=(i % 3) * 2)
            for i in range(10)
        ]

        payload = {
            "frames_base64": frames,
            "sample_step": 1,
            "session_id": "ENR-TEST-001"
        }
        res = await ac.post("/api/face/enrollment/validate-sample", json=payload)
        assert res.status_code == 200
        data = res.json()

        assert data["face_detected"] is True
        assert data["single_face"] is True
        assert data["quality_score"] >= 0.60
        assert data["liveness_pass"] is True
        assert data["liveness_method"] == "HEURISTIC_MULTI_FRAME_TEMPORAL"
        assert "blur_score" in data
        assert "luminance_score" in data
        assert "contrast_score" in data
        assert "centering_score" in data
        assert "liveness_scores" in data
        assert data["ready_to_capture"] is True
        assert data["accepted"] is True

@pytest.mark.asyncio
async def test_backlighting_detection_separate_from_spoof():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Generate frames with bright window perimeter behind face
        frames_backlit = [
            generate_face_frame(brightness=140, micro_shift=(i % 3), backlit=True)
            for i in range(5)
        ]

        payload = {
            "frames_base64": frames_backlit,
            "sample_step": 1
        }
        res = await ac.post("/api/face/enrollment/validate-sample", json=payload)
        assert res.status_code == 200
        data = res.json()

        # Must report LIGHTING_UNEVEN, not spoof failure!
        assert data["reason"] == "LIGHTING_UNEVEN"
        assert "lighting is uneven" in data["guidance"].lower()
        assert data["lighting_condition"] == "BACKLIT"

@pytest.mark.asyncio
async def test_static_photo_spoof_detection_in_temporal_buffer():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Identical frames (zero temporal micro-variance)
        single_frame = generate_face_frame(brightness=140)
        identical_frames = [single_frame] * 10

        payload = {
            "frames_base64": identical_frames,
            "sample_step": 1
        }
        res = await ac.post("/api/face/enrollment/validate-sample", json=payload)
        assert res.status_code == 200
        data = res.json()

        # Static photo must be rejected
        assert data["ready_to_capture"] is False
        assert data["liveness_pass"] is False
        assert "STATIC_PHOTO" in data["reason"] or data["liveness_scores"]["temporal_score"] < 0.40

@pytest.mark.asyncio
async def test_zero_raw_image_retention():
    """Verify that no image or video files are persisted in backend directories."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    forbidden_extensions = [".jpg", ".jpeg", ".png", ".webm", ".mp4", ".avi"]
    
    saved_media = []
    for root, dirs, files in os.walk(backend_dir):
        # Ignore virtual environment and git
        if "venv" in root or ".git" in root or "__pycache__" in root:
            continue
        for f in files:
            if any(f.lower().endswith(ext) for ext in forbidden_extensions):
                saved_media.append(os.path.join(root, f))
                
    assert len(saved_media) == 0, f"Raw camera media files found on disk: {saved_media}"
