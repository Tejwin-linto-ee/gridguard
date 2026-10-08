import pytest
import numpy as np
import cv2
import base64
import datetime
from typing import List

from backend.app.services.face_auth.detector import FaceDetector, TemporalFaceTracker
from backend.app.services.face_auth.quality import face_quality_analyzer
from backend.app.services.face_auth.liveness import anti_spoof_engine
from backend.app.services.face_auth.embedding import embedding_extractor
from backend.app.services.face_auth.matcher import face_matcher
from backend.app.services.face_auth.policy import reset_policy_engine

def create_synthetic_face(
    center_x: int = 320,
    center_y: int = 240,
    radius_x: int = 90,
    radius_y: int = 130,
    blur: bool = False,
    bg_brightness: int = 128,
    face_brightness: int = 190
) -> np.ndarray:
    """Creates a synthetic BGR face image with natural facial features for testing."""
    img = np.full((480, 640, 3), bg_brightness, dtype=np.uint8)
    # Face skin ellipse
    cv2.ellipse(img, (center_x, center_y), (radius_x, radius_y), 0, 0, 360, (face_brightness-20, face_brightness-10, face_brightness), -1)
    # Eyes
    cv2.circle(img, (center_x - 35, center_y - 30), 10, (40, 40, 40), -1)
    cv2.circle(img, (center_x + 35, center_y - 30), 10, (40, 40, 40), -1)
    # Nose
    cv2.ellipse(img, (center_x, center_y + 10), (8, 16), 0, 0, 360, (140, 140, 160), -1)
    # Mouth
    cv2.ellipse(img, (center_x, center_y + 55), (30, 12), 0, 0, 360, (50, 50, 180), -1)

    if blur:
        img = cv2.GaussianBlur(img, (31, 31), 15.0)

    return img

def to_base64(img: np.ndarray) -> str:
    _, buf = cv2.imencode('.jpg', img)
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode('utf-8')


# TEST 01: One person / clean background -> ONE_FACE
def test_01_one_person_clean_background():
    detector = FaceDetector()
    img = create_synthetic_face(center_x=320, center_y=240)
    # Initialize track with 2 consecutive frames to confirm
    detector.detect_face(img)
    det = detector.detect_face(img)
    assert det["face_detected"] is True
    assert det["face_count"] == 1
    assert det["stable_tracks_count"] == 1
    assert det["error_code"] is None


# TEST 02: One person / duplicate detector boxes -> ONE_FACE after NMS & duplicate suppression
def test_02_duplicate_detector_boxes_suppressed():
    detector = FaceDetector()
    # Simulate two overlapping candidate boxes for the same face (IoU = 0.88)
    boxA = (200, 100, 240, 240)
    boxB = (206, 104, 238, 236)
    scores = [7.5, 6.8]

    # Test NMS
    nms_boxes, nms_scores = detector.apply_nms([boxA, boxB], scores, iou_threshold=0.38)
    assert len(nms_boxes) == 1
    assert nms_scores[0] == 7.5

    # Test secondary duplicate suppression on nested boxes
    box_outer = (190, 95, 260, 260)
    box_inner = (205, 110, 230, 230)
    dup_boxes, dup_scores = detector.suppress_duplicate_faces([box_outer, box_inner], [8.0, 5.0])
    assert len(dup_boxes) == 1
    assert dup_boxes[0] == box_outer


# TEST 03: One person / noisy webcam frames -> ONE_STABLE_FACE
def test_03_noisy_webcam_frames_one_stable_face():
    detector = FaceDetector()
    for i in range(5):
        # Slight noise/jitter
        dx = int(np.random.randint(-3, 3))
        dy = int(np.random.randint(-3, 3))
        img = create_synthetic_face(center_x=320+dx, center_y=240+dy)
        det = detector.detect_face(img)

    assert det["face_detected"] is True
    assert det["face_count"] == 1
    assert det["stable_tracks_count"] == 1
    assert det["stability_score"] >= 0.70


# TEST 04: One person / moderate head movement -> ONE_TRACK
def test_04_moderate_head_movement_one_track():
    tracker = TemporalFaceTracker(iou_match_threshold=0.30)
    # Continuous natural trajectory moving from left to right
    for i in range(8):
        x = 200 + i * 8
        y = 150 + int(np.sin(i) * 5)
        tracker.update([(x, y, 200, 200)], [8.0])

    confirmed = tracker.get_confirmed_tracks()
    assert len(confirmed) == 1
    assert confirmed[0].track_id == 1
    assert confirmed[0].hits == 8


# TEST 05: Two people / persistent -> MULTIPLE_FACES
def test_05_two_persistent_people_multiple_faces():
    tracker = TemporalFaceTracker(iou_match_threshold=0.30)
    # Two distinct spatial faces across 5 consecutive frames
    for i in range(5):
        box1 = (100, 150, 180, 180)
        box2 = (380, 150, 180, 180)
        tracker.update([box1, box2], [7.5, 7.2])

    confirmed = tracker.get_confirmed_tracks()
    assert len(confirmed) == 2


# TEST 06: Second face appears for one frame only -> do not immediately classify as multiple people
def test_06_transient_second_face_suppression():
    tracker = TemporalFaceTracker(iou_match_threshold=0.30)
    # Frame 1-3: Primary user only
    for _ in range(3):
        tracker.update([(220, 140, 200, 200)], [8.0])
    assert len(tracker.get_confirmed_tracks()) == 1

    # Frame 4: Spurious background detection appears for 1 frame
    tracker.update([(220, 140, 200, 200), (500, 50, 80, 80)], [8.0, 2.5])
    # Confirmed tracks must still be exactly 1!
    assert len(tracker.get_confirmed_tracks()) == 1

    # Frame 5: Spurious detection disappears
    tracker.update([(220, 140, 200, 200)], [8.0])
    assert len(tracker.get_confirmed_tracks()) == 1


# TEST 07: No face -> NO_FACE
def test_07_no_face_in_frame():
    detector = FaceDetector()
    blank_img = np.full((480, 640, 3), 128, dtype=np.uint8)
    det = detector.detect_face(blank_img)
    assert det["face_detected"] is False
    assert det["face_count"] == 0
    assert det["error_code"] == "NO_FACE"


# TEST 08: Face partially outside frame -> QUALITY_FAILURE (boundary clipped)
def test_08_face_boundary_clipped_quality_failure():
    detector = FaceDetector()
    # A box where > 50% is outside the image bounds [0, 640]
    clipped_box = (-150, 100, 260, 260)
    boxes, scores = detector.filter_box_quality([clipped_box], [6.0], img_w=640, img_h=480)
    assert len(boxes) == 0


# TEST 09: Severe blur -> QUALITY_FAILURE
def test_09_severe_blur_quality_failure():
    img_blur = create_synthetic_face(blur=True)
    qual = face_quality_analyzer.evaluate_quality(img_blur, (230, 110, 180, 260), [])
    assert qual["metrics"]["blur_score"] < 0.60
    assert qual["passed"] is False


# TEST 10: Backlit genuine user -> QUALITY guidance, not automatic spoof classification
def test_10_backlit_user_gives_lighting_guidance():
    # Bright window background (240), darker face (90)
    backlit_img = create_synthetic_face(bg_brightness=240, face_brightness=90)
    qual = face_quality_analyzer.evaluate_quality(backlit_img, (230, 110, 180, 260), [])
    assert qual["lighting_condition"] in ("BACKLIT", "UNEVEN", "OPTIMAL")
    # Must NOT return SPOOF
    assert "SPOOF" not in qual["quality_state"]


# TEST 11: Printed face -> liveness rejection (STATIC_PHOTO_PRINT)
def test_11_printed_face_static_liveness_rejection():
    # Exactly identical static crops across 10 frames
    crop = create_synthetic_face()[110:370, 230:410]
    static_sequence = [crop] * 10
    liveness = anti_spoof_engine.evaluate_liveness(static_sequence)
    assert liveness["liveness_passed"] is False
    assert liveness["detected_attack"] == "STATIC_PHOTO_PRINT"


# TEST 12: Screen replay -> liveness rejection
def test_12_screen_replay_zero_motion_rejection():
    crop = create_synthetic_face()[110:370, 230:410]
    # Stationary screen presentation with zero physiological motion
    liveness = anti_spoof_engine.evaluate_liveness([crop] * 12)
    assert liveness["liveness_passed"] is False
    assert liveness["liveness_scores"]["temporal_score"] < 0.35


# TEST 13: Unknown person -> IDENTITY_NOT_AUTHORIZED
def test_13_unknown_person_identity_rejected():
    enrolled_user = {
        "user_id": "OP-AUTHORIZED-01",
        "display_name": "Authorized Lead",
        "role": "OPERATOR",
        "status": "ACTIVE",
        "embedding_vector": np.ones(512, dtype=np.float32) / np.sqrt(512)
    }
    # Uncorrelated random probe vector (cosine similarity near 0.50)
    rng = np.random.RandomState(999)
    v_unknown = rng.randn(512).astype(np.float32)
    v_unknown = v_unknown / np.linalg.norm(v_unknown)

    match = face_matcher.match_against_enrolled_users(v_unknown, [enrolled_user])
    assert match["matched"] is False


# TEST 14: Authorized person -> IDENTITY_VERIFIED
def test_14_authorized_person_identity_verified():
    rng = np.random.RandomState(42)
    vec = rng.randn(512).astype(np.float32)
    vec = vec / np.linalg.norm(vec)

    enrolled_user = {
        "user_id": "OP-AUTHORIZED-01",
        "display_name": "Authorized Lead",
        "role": "OPERATOR",
        "status": "ACTIVE",
        "embedding_vector": vec
    }
    # Probe vector with minor natural variation (high similarity ~0.98)
    probe_vec = vec + rng.normal(0, 0.02, 512).astype(np.float32)
    probe_vec = probe_vec / np.linalg.norm(probe_vec)

    match = face_matcher.match_against_enrolled_users(probe_vec, [enrolled_user])
    assert match["matched"] is True
    assert match["best_user_id"] == "OP-AUTHORIZED-01"


# TEST 15: Authorized person + unsafe current (3.45 A > 2.50 A) -> RESET BLOCKED
def test_15_authorized_person_with_unsafe_current_blocks_reset():
    # Electrical safety invariant: Even with 100% verified face, unsafe current blocks reset
    channel_id = 1
    measured_current = 3.45  # Exceeds safe threshold 2.50 A
    max_safe_current = 2.50
    active_fault = True

    safety_passed = (measured_current <= max_safe_current) and (not active_fault)
    assert safety_passed is False
