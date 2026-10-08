import cv2
import numpy as np
from typing import Tuple, List, Dict, Any

class FaceQualityAnalyzer:
    """
    Evaluates face image quality before recognition (Requirements 4, 5, 24, 25).
    Evaluates:
    - Face Size Ratio (Area relative to viewport)
    - Sharpness / Blur (Laplacian variance)
    - Brightness & Contrast (Illumination balance)
    - Centering & Alignment (Yaw/Pitch offset)
    - Pose orientation (Frontal, Turn Left, Turn Right)
    """
    def __init__(
        self,
        min_quality_threshold: float = 0.60,
        min_sharpness: float = 45.0,
        min_brightness: float = 45.0,
        max_brightness: float = 230.0,
        min_contrast: float = 18.0
    ):
        self.min_quality_threshold = min_quality_threshold
        self.min_sharpness = min_sharpness
        self.min_brightness = min_brightness
        self.max_brightness = max_brightness
        self.min_contrast = min_contrast
        self.quality_model_version = "qual-v1.3-iso19794"

    def estimate_pose(
        self,
        face_crop: np.ndarray,
        eyes: List[Tuple[int, int, int, int]]
    ) -> Dict[str, Any]:
        """
        Estimates yaw/pitch/roll proxy from facial landmark symmetry.
        """
        if face_crop is None or face_crop.size == 0:
            return {"pose_category": "UNKNOWN", "yaw_score": 0.0, "roll_deg": 0.0}

        h, w = face_crop.shape[:2]
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY) if len(face_crop.shape) == 3 else face_crop

        # Compute horizontal luminance symmetry (left half vs right half)
        half_w = w // 2
        left_half = gray[:, :half_w]
        right_half = cv2.flip(gray[:, half_w:half_w*2], 1)
        min_cols = min(left_half.shape[1], right_half.shape[1])
        diff = np.mean(left_half[:, :min_cols].astype(float) - right_half[:, :min_cols].astype(float))
        # Normalized yaw proxy in [-1.0 (turned left), 1.0 (turned right)]
        yaw_proxy = float(np.clip(diff / 30.0, -1.0, 1.0))

        roll_deg = 0.0
        if len(eyes) >= 2:
            # Sort eyes left to right
            sorted_eyes = sorted(eyes, key=lambda e: e[0])
            ex1, ey1 = sorted_eyes[0][0] + sorted_eyes[0][2]//2, sorted_eyes[0][1] + sorted_eyes[0][3]//2
            ex2, ey2 = sorted_eyes[1][0] + sorted_eyes[1][2]//2, sorted_eyes[1][1] + sorted_eyes[1][3]//2
            dy = ey2 - ey1
            dx = ex2 - ex1
            if dx > 0:
                roll_deg = float(np.degrees(np.arctan2(dy, dx)))

        if yaw_proxy < -0.25:
            pose_cat = "TURNED_LEFT"
        elif yaw_proxy > 0.25:
            pose_cat = "TURNED_RIGHT"
        else:
            pose_cat = "FRONTAL"

        return {
            "pose_category": pose_cat,
            "yaw_score": round(yaw_proxy, 2),
            "roll_deg": round(roll_deg, 1)
        }

    def evaluate_quality(
        self,
        frame: np.ndarray,
        bbox: Tuple[int, int, int, int],
        eyes: List[Tuple[int, int, int, int]]
    ) -> Dict[str, Any]:
        h_frame, w_frame = frame.shape[:2]
        x, y, fw, fh = bbox

        # 1. Size Ratio Check (allow faces from 1.5% to 75% of viewport area)
        frame_area = float(h_frame * w_frame)
        face_area = float(fw * fh)
        size_ratio = face_area / frame_area if frame_area > 0 else 0.0

        size_score = 1.0
        guidance = "FACE_ALIGNED"
        quality_state = "QUALITY_PASSED"

        if size_ratio < 0.015:
            size_score = max(0.1, size_ratio / 0.015)
            guidance = "Move closer"
            quality_state = "FACE_TOO_SMALL"
        elif size_ratio > 0.75:
            size_score = max(0.2, (1.0 - size_ratio) / 0.25)
            guidance = "Move back"
            quality_state = "FACE_TOO_LARGE"
        else:
            size_score = 1.0

        # Extract face crop for localized metrics
        face_crop = frame[max(0, y):min(h_frame, y+fh), max(0, x):min(w_frame, x+fw)]
        if face_crop.size == 0:
            return {
                "quality_score": 0.0,
                "category": "POOR",
                "passed": False,
                "guidance": "Position face inside frame",
                "quality_state": "NO_FACE_DETECTED",
                "lighting_condition": "UNKNOWN",
                "metrics": {
                    "blur_score": 0.0,
                    "luminance_score": 0.0,
                    "contrast_score": 0.0,
                    "centering_score": 0.0
                }
            }

        gray_face = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame

        # 2. Sharpness / Blur Check (Laplacian gradient variance)
        laplacian_var = float(cv2.Laplacian(gray_face, cv2.CV_64F).var())
        # >80 is very sharp, 35-80 is acceptable, <25 is blurred
        if laplacian_var >= 80.0:
            sharpness_score = 1.0
        elif laplacian_var >= 35.0:
            sharpness_score = 0.6 + (0.4 * (laplacian_var - 35.0) / 45.0)
        else:
            sharpness_score = max(0.05, laplacian_var / 70.0)
            if laplacian_var < 18.0 and guidance == "FACE_ALIGNED":
                guidance = "Hold camera still"
                quality_state = "IMAGE_TOO_BLURRY"
            elif guidance == "FACE_ALIGNED":
                guidance = "Hold still"
                quality_state = "IMAGE_TOO_BLURRY"

        # 3. Brightness & Lighting Balance Check (Mean luminance in 40..235)
        mean_brightness = float(np.mean(gray_face))
        bg_brightness = float(np.mean(gray_frame))
        
        # Check asymmetric face illumination
        half_w = gray_face.shape[1] // 2
        left_luma = float(np.mean(gray_face[:, :half_w])) if half_w > 0 else mean_brightness
        right_luma = float(np.mean(gray_face[:, half_w:])) if half_w > 0 else mean_brightness
        asym_luma = abs(left_luma - right_luma)

        lighting_condition = "OPTIMAL"
        brightness_score = 1.0

        # Mask out face bbox to measure ambient background brightness
        bg_mask = np.ones((h_frame, w_frame), dtype=bool)
        bg_mask[max(0, y):min(h_frame, y+fh), max(0, x):min(w_frame, x+fw)] = False
        ambient_bg = float(np.mean(gray_frame[bg_mask])) if np.any(bg_mask) else bg_brightness

        # Backlighting detection
        if (ambient_bg >= 180.0 and (ambient_bg - mean_brightness) >= 30.0) or (ambient_bg >= 220.0 and mean_brightness <= 140.0):
            lighting_condition = "BACKLIT"
            brightness_score = 0.60
            if guidance == "FACE_ALIGNED":
                guidance = "Lighting uneven (backlit)"
                quality_state = "LIGHTING_UNEVEN"
        elif asym_luma >= 45.0:
            lighting_condition = "UNEVEN"
            brightness_score = 0.70
            if guidance == "FACE_ALIGNED":
                guidance = "Lighting uneven"
                quality_state = "LIGHTING_UNEVEN"
        elif mean_brightness < 40.0:
            lighting_condition = "DIM"
            brightness_score = max(0.1, mean_brightness / 40.0)
            if guidance == "FACE_ALIGNED":
                guidance = "Improve lighting"
                quality_state = "LOW_LIGHT"
        elif mean_brightness > 235.0:
            lighting_condition = "OVEREXPOSED"
            brightness_score = max(0.2, (255.0 - mean_brightness) / 20.0)
            if guidance == "FACE_ALIGNED":
                guidance = "Too bright"
                quality_state = "LIGHTING_TOO_HIGH"
        else:
            lighting_condition = "OPTIMAL"
            brightness_score = 1.0

        # 4. Contrast Check (Standard deviation of luminance)
        contrast = float(np.std(gray_face))
        contrast_score = float(np.clip(contrast / 35.0, 0.1, 1.0))

        # 5. Centering / Alignment
        center_x = (x + fw / 2.0) / float(w_frame)
        center_y = (y + fh / 2.0) / float(h_frame)
        offset_x = center_x - 0.5
        offset_y = center_y - 0.5

        if abs(offset_x) > 0.28:
            alignment_score = max(0.3, 1.0 - abs(offset_x))
            if guidance == "FACE_ALIGNED":
                guidance = "Center your face (move left)" if offset_x > 0 else "Center your face (move right)"
                quality_state = "FACE_NOT_CENTERED"
        elif abs(offset_y) > 0.30:
            alignment_score = max(0.4, 1.0 - abs(offset_y))
            if guidance == "FACE_ALIGNED":
                guidance = "Center your face"
                quality_state = "FACE_NOT_CENTERED"
        else:
            alignment_score = 1.0

        # 6. Pose Estimation
        pose = self.estimate_pose(face_crop, eyes)

        # Composite quality score (weighted sum)
        quality_score = round(
            (0.30 * sharpness_score) +
            (0.25 * size_score) +
            (0.20 * brightness_score) +
            (0.15 * contrast_score) +
            (0.10 * alignment_score),
            2
        )

        if quality_score >= 0.85:
            category = "EXCELLENT"
        elif quality_score >= 0.65:
            category = "GOOD"
        elif quality_score >= 0.50:
            category = "FAIR"
        else:
            category = "POOR"

        passed = quality_score >= self.min_quality_threshold and laplacian_var >= 18.0 and lighting_condition not in ["DIM", "OVEREXPOSED", "BACKLIT"]

        return {
            "quality_score": quality_score,
            "category": category,
            "passed": passed,
            "guidance": "HOLD_STILL" if passed else guidance,
            "quality_state": quality_state if not passed else "QUALITY_PASSED",
            "lighting_condition": lighting_condition,
            "pose": pose,
            "model_version": self.quality_model_version,
            "metrics": {
                "blur_score": round(sharpness_score, 2),
                "sharpness_laplacian": round(laplacian_var, 1),
                "luminance_score": round(brightness_score, 2),
                "brightness_mean": round(mean_brightness, 1),
                "contrast_score": round(contrast_score, 2),
                "contrast_std": round(contrast, 1),
                "centering_score": round(alignment_score, 2),
                "size_ratio": round(size_ratio, 3),
                "center_offset": (round(offset_x, 2), round(offset_y, 2)),
                "pose_category": pose["pose_category"],
                "yaw_score": pose["yaw_score"],
                "lighting_condition": lighting_condition,
                "asym_luma": round(asym_luma, 1)
            }
        }

face_quality_analyzer = FaceQualityAnalyzer()
