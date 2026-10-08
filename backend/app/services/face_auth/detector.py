import cv2
import numpy as np
import base64
import os
import time
from typing import Optional, Tuple, List, Dict, Any

class FaceTrack:
    """Represents a temporally tracked human face instance across video frames."""
    def __init__(self, track_id: int, bbox: Tuple[int, int, int, int], confidence: float):
        self.track_id = track_id
        self.bbox = bbox  # (x, y, w, h)
        self.confidence = confidence
        self.hits = 1
        self.misses = 0
        self.age = 1
        self.bbox_history: List[Tuple[int, int, int, int]] = [bbox]
        self.centroid_history: List[Tuple[float, float]] = [self._calc_centroid(bbox)]
        self.confidence_history: List[float] = [confidence]
        self.stability_score = 0.50

    @staticmethod
    def _calc_centroid(bbox: Tuple[int, int, int, int]) -> Tuple[float, float]:
        x, y, w, h = bbox
        return (float(x + w / 2.0), float(y + h / 2.0))

    def update(self, bbox: Tuple[int, int, int, int], confidence: float):
        self.bbox = bbox
        self.confidence = confidence
        self.hits += 1
        self.misses = 0
        self.age += 1
        self.bbox_history.append(bbox)
        if len(self.bbox_history) > 20:
            self.bbox_history.pop(0)

        centroid = self._calc_centroid(bbox)
        self.centroid_history.append(centroid)
        if len(self.centroid_history) > 20:
            self.centroid_history.pop(0)

        self.confidence_history.append(confidence)
        if len(self.confidence_history) > 20:
            self.confidence_history.pop(0)

        self._compute_stability()

    def mark_missed(self):
        self.misses += 1
        self.age += 1
        self._compute_stability()

    def _compute_stability(self):
        """Calculates multi-dimensional spatial, size, and temporal stability score."""
        # 1. Temporal hit ratio
        hit_ratio = min(1.0, float(self.hits) / float(max(1, self.age)))
        # 2. Centroid displacement jitter
        if len(self.centroid_history) >= 2:
            displacements = [
                np.hypot(self.centroid_history[i][0] - self.centroid_history[i-1][0],
                         self.centroid_history[i][1] - self.centroid_history[i-1][1])
                for i in range(1, len(self.centroid_history))
            ]
            avg_disp = float(np.mean(displacements))
            disp_stability = max(0.0, 1.0 - (avg_disp / max(10.0, self.bbox[2] * 0.25)))
        else:
            disp_stability = 0.80

        # 3. Size consistency
        if len(self.bbox_history) >= 2:
            areas = [float(b[2] * b[3]) for b in self.bbox_history]
            area_var = float(np.std(areas) / max(1.0, np.mean(areas)))
            size_stability = max(0.0, 1.0 - min(1.0, area_var))
        else:
            size_stability = 0.80

        # 4. Confidence consistency
        mean_conf = float(np.mean(self.confidence_history))
        norm_conf = min(1.0, max(0.0, mean_conf / 10.0)) if mean_conf > 1.0 else mean_conf

        self.stability_score = round(
            0.30 * hit_ratio + 0.25 * disp_stability + 0.25 * size_stability + 0.20 * norm_conf,
            3
        )

    @property
    def is_confirmed(self) -> bool:
        """A track is confirmed as a real human face if seen in multiple frames or single high-confidence detection."""
        return self.hits >= 2 or (self.hits == 1 and self.confidence >= 3.5)


class TemporalFaceTracker:
    """
    Lightweight, robust multi-frame face tracker.
    Prevents single-frame transient detector hallucinations from triggering MULTIPLE_FACES.
    """
    def __init__(self, iou_match_threshold: float = 0.30, max_misses: int = 4):
        self.tracks: List[FaceTrack] = []
        self.next_track_id = 1
        self.iou_match_threshold = iou_match_threshold
        self.max_misses = max_misses

    @staticmethod
    def compute_iou(boxA: Tuple[int, int, int, int], boxB: Tuple[int, int, int, int]) -> float:
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[0] + boxA[2], boxB[0] + boxB[2])
        yB = min(boxA[1] + boxA[3], boxB[1] + boxB[3])

        interW = max(0, xB - xA)
        interH = max(0, yB - yA)
        interArea = interW * interH
        if interArea == 0:
            return 0.0

        boxAArea = boxA[2] * boxA[3]
        boxBArea = boxB[2] * boxB[3]
        iou = float(interArea) / float(boxAArea + boxBArea - interArea)
        return float(iou)

    def update(self, detections: List[Tuple[int, int, int, int]], scores: List[float]) -> List[FaceTrack]:
        """Matches new frame detections with existing tracks and updates track state."""
        matched_track_indices = set()
        matched_det_indices = set()

        # Match existing tracks with detections via IoU and centroid proximity
        if len(self.tracks) > 0 and len(detections) > 0:
            cost_matrix = []
            for t_idx, track in enumerate(self.tracks):
                row = []
                for d_idx, det in enumerate(detections):
                    iou = self.compute_iou(track.bbox, det)
                    # Check centroid proximity as fallback for rapid movements
                    c1 = track._calc_centroid(track.bbox)
                    c2 = FaceTrack._calc_centroid(det)
                    dist = np.hypot(c1[0] - c2[0], c1[1] - c2[1])
                    diag = np.hypot(track.bbox[2], track.bbox[3])
                    prox_score = max(0.0, 1.0 - (dist / max(1.0, diag))) if dist < diag else 0.0
                    combined_match = max(iou, prox_score * 0.85)
                    row.append(combined_match)
                cost_matrix.append(row)

            # Greedy assignment of best matches
            cost_matrix = np.array(cost_matrix)
            while True:
                if cost_matrix.size == 0:
                    break
                max_val = np.max(cost_matrix)
                if max_val < self.iou_match_threshold:
                    break
                t_idx, d_idx = np.unravel_index(np.argmax(cost_matrix), cost_matrix.shape)
                if t_idx in matched_track_indices or d_idx in matched_det_indices:
                    cost_matrix[t_idx, d_idx] = -1.0
                    continue

                self.tracks[t_idx].update(detections[d_idx], scores[d_idx])
                matched_track_indices.add(t_idx)
                matched_det_indices.add(d_idx)
                cost_matrix[t_idx, :] = -1.0
                cost_matrix[:, d_idx] = -1.0

        # Mark unmatched tracks as missed
        for t_idx, track in enumerate(self.tracks):
            if t_idx not in matched_track_indices:
                track.mark_missed()

        # Create new tracks for unmatched detections
        for d_idx, det in enumerate(detections):
            if d_idx not in matched_det_indices:
                new_track = FaceTrack(self.next_track_id, det, scores[d_idx])
                self.next_track_id += 1
                self.tracks.append(new_track)

        # Remove dead tracks (misses exceeding limit)
        self.tracks = [t for t in self.tracks if t.misses <= self.max_misses]

        return self.tracks

    def get_confirmed_tracks(self) -> List[FaceTrack]:
        """Returns tracks that have confirmed persistent temporal identity and were detected in current frame."""
        return [t for t in self.tracks if t.is_confirmed and t.misses == 0]

    def reset(self):
        """Resets tracker state."""
        self.tracks = []
        self.next_track_id = 1


class FaceDetector:
    """
    Advanced Enterprise Face Detection, NMS, Quality Filtering & Tracking Engine.
    Implements:
    - Multi-scale Haar detection with level weights
    - Non-Maximum Suppression (IoU: 0.35 - 0.45)
    - Concentric and nested duplicate-face suppression
    - Aspect ratio, boundary clipping, and resolution-aware size filtering
    - Multi-frame temporal face tracking
    - Landmark eye detection & horizontal roll alignment
    """
    def __init__(self):
        cascade_dir = cv2.data.haarcascades
        face_cascade_path = os.path.join(cascade_dir, "haarcascade_frontalface_default.xml")
        eye_cascade_path = os.path.join(cascade_dir, "haarcascade_eye.xml")

        self.face_cascade = cv2.CascadeClassifier(face_cascade_path)
        self.eye_cascade = cv2.CascadeClassifier(eye_cascade_path)
        self.tracker = TemporalFaceTracker(iou_match_threshold=0.30, max_misses=3)
        self.detector_version = "OpenCV-Haar-v4.14.0-NMS-Tracked"

        if self.face_cascade.empty():
            print("CRITICAL: Face cascade classifier failed to load from", face_cascade_path)

    def decode_image(self, image_data: str) -> Optional[np.ndarray]:
        """Decodes base64 string or data-uri into a BGR uint8 OpenCV image."""
        try:
            if not image_data or not isinstance(image_data, str):
                return None
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]
            image_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return img
        except Exception as e:
            print(f"Error decoding image frame: {e}")
            return None

    @staticmethod
    def compute_iou(boxA: Tuple[int, int, int, int], boxB: Tuple[int, int, int, int]) -> float:
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[0] + boxA[2], boxB[0] + boxB[2])
        yB = min(boxA[1] + boxA[3], boxB[1] + boxB[3])

        interW = max(0, xB - xA)
        interH = max(0, yB - yA)
        interArea = interW * interH
        if interArea == 0:
            return 0.0

        boxAArea = boxA[2] * boxA[3]
        boxBArea = boxB[2] * boxB[3]
        return float(interArea) / float(boxAArea + boxBArea - interArea)

    def apply_nms(
        self,
        boxes: List[Tuple[int, int, int, int]],
        scores: List[float],
        iou_threshold: float = 0.38
    ) -> Tuple[List[Tuple[int, int, int, int]], List[float]]:
        """
        Class-aware Non-Maximum Suppression.
        Sorts detections by score/weight and removes overlapping duplicates.
        """
        if len(boxes) <= 1:
            return boxes, scores

        # Sort indices by score descending
        order = np.argsort(scores)[::-1]
        keep_boxes: List[Tuple[int, int, int, int]] = []
        keep_scores: List[float] = []

        suppressed = [False] * len(boxes)

        for i in range(len(order)):
            idx_i = order[i]
            if suppressed[idx_i]:
                continue

            keep_boxes.append(boxes[idx_i])
            keep_scores.append(scores[idx_i])

            boxA = boxes[idx_i]
            for j in range(i + 1, len(order)):
                idx_j = order[j]
                if suppressed[idx_j]:
                    continue

                boxB = boxes[idx_j]
                iou = self.compute_iou(boxA, boxB)
                if iou >= iou_threshold:
                    suppressed[idx_j] = True

        return keep_boxes, keep_scores

    def suppress_duplicate_faces(
        self,
        boxes: List[Tuple[int, int, int, int]],
        scores: List[float]
    ) -> Tuple[List[Tuple[int, int, int, int]], List[float]]:
        """
        Secondary duplicate suppression stage:
        Detects near-concentric boxes, nested boxes, and scale-split duplicates of the same face.
        """
        if len(boxes) <= 1:
            return boxes, scores

        keep_indices = set(range(len(boxes)))

        for i in range(len(boxes)):
            if i not in keep_indices:
                continue
            b1 = boxes[i]
            c1_x = b1[0] + b1[2] / 2.0
            c1_y = b1[1] + b1[3] / 2.0
            area1 = b1[2] * b1[3]

            for j in range(i + 1, len(boxes)):
                if j not in keep_indices:
                    continue
                b2 = boxes[j]
                c2_x = b2[0] + b2[2] / 2.0
                c2_y = b2[1] + b2[3] / 2.0
                area2 = b2[2] * b2[3]

                # 1. Centroid distance relative to face size
                dist = np.hypot(c1_x - c2_x, c1_y - c2_y)
                max_dim = max(b1[2], b1[3], b2[2], b2[3])
                relative_dist = dist / max(1.0, max_dim)

                # 2. Nested containment check (box intersection / smaller box area)
                xA = max(b1[0], b2[0])
                yA = max(b1[1], b2[1])
                xB = min(b1[0] + b1[2], b2[0] + b2[2])
                yB = min(b1[1] + b1[3], b2[1] + b2[3])
                inter = max(0, xB - xA) * max(0, yB - yA)
                min_area = min(area1, area2)
                containment = float(inter) / float(min_area) if min_area > 0 else 0.0

                # If boxes are near-concentric (dist < 35% of size) or highly nested (> 75% containment)
                if relative_dist < 0.35 or containment > 0.75:
                    # Suppress the lower-scoring box
                    if scores[i] >= scores[j]:
                        keep_indices.discard(j)
                    else:
                        keep_indices.discard(i)
                        break

        filtered_boxes = [boxes[k] for k in sorted(keep_indices)]
        filtered_scores = [scores[k] for k in sorted(keep_indices)]
        return filtered_boxes, filtered_scores

    def filter_box_quality(
        self,
        boxes: List[Tuple[int, int, int, int]],
        scores: List[float],
        img_w: int,
        img_h: int
    ) -> Tuple[List[Tuple[int, int, int, int]], List[float]]:
        """
        Filters out geometrically implausible or severely clipped candidate face boxes.
        """
        valid_boxes: List[Tuple[int, int, int, int]] = []
        valid_scores: List[float] = []
        img_area = float(img_w * img_h)

        for box, score in zip(boxes, scores):
            x, y, w, h = box

            # 1. Aspect ratio check (human faces typically have width/height ratio between 0.65 and 1.35)
            if h <= 0 or w <= 0:
                continue
            aspect = float(w) / float(h)
            if aspect < 0.62 or aspect > 1.38:
                continue

            # 2. Resolution-aware size checks
            area = float(w * h)
            area_ratio = area / img_area
            # Must occupy between 2.5% and 82% of screen area
            if area_ratio < 0.025 or area_ratio > 0.82:
                continue

            # 3. Boundary clipping check (reject if more than 35% of face extends outside viewport)
            clip_x1 = max(0, x)
            clip_y1 = max(0, y)
            clip_x2 = min(img_w, x + w)
            clip_y2 = min(img_h, y + h)
            visible_area = max(0, clip_x2 - clip_x1) * max(0, clip_y2 - clip_y1)
            if visible_area < 0.65 * area:
                continue

            # 4. Minimum confidence / level weight threshold
            if score < 1.8:
                continue

            # Box is geometrically plausible and within quality bounds
            valid_boxes.append((int(clip_x1), int(clip_y1), int(clip_x2 - clip_x1), int(clip_y2 - clip_y1)))
            valid_scores.append(float(score))

        return valid_boxes, valid_scores

    def align_face_crop(
        self,
        img: np.ndarray,
        bbox: Tuple[int, int, int, int],
        eyes: List[Tuple[int, int, int, int]]
    ) -> Tuple[np.ndarray, float]:
        """
        Aligns face crop by rotating around inter-eye midpoint to level eyes horizontally.
        Returns the aligned face crop and roll angle in degrees.
        """
        h_img, w_img = img.shape[:2]
        x, y, fw, fh = bbox

        # Safe crop margin
        margin_x = int(fw * 0.12)
        margin_y = int(fh * 0.16)
        x1 = max(0, x - margin_x)
        y1 = max(0, y - margin_y)
        x2 = min(w_img, x + fw + margin_x)
        y2 = min(h_img, y + fh + margin_y)
        raw_crop = img[y1:y2, x1:x2].copy()

        roll_deg = 0.0
        if len(eyes) >= 2:
            sorted_eyes = sorted(eyes, key=lambda e: e[0])
            e1 = sorted_eyes[0]
            e2 = sorted_eyes[1]
            eye1_center = (e1[0] + e1[2] / 2.0, e1[1] + e1[3] / 2.0)
            eye2_center = (e2[0] + e2[2] / 2.0, e2[1] + e2[3] / 2.0)

            dx = eye2_center[0] - eye1_center[0]
            dy = eye2_center[1] - eye1_center[1]
            if dx > 0:
                roll_deg = float(np.degrees(np.arctan2(dy, dx)))

                # Perform rotation if tilt exceeds 2.0 degrees
                if abs(roll_deg) > 2.0 and abs(roll_deg) < 45.0:
                    crop_center = (raw_crop.shape[1] / 2.0, raw_crop.shape[0] / 2.0)
                    rot_mat = cv2.getRotationMatrix2D(crop_center, roll_deg, 1.0)
                    raw_crop = cv2.warpAffine(
                        raw_crop, rot_mat,
                        (raw_crop.shape[1], raw_crop.shape[0]),
                        flags=cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_REPLICATE
                    )

        return raw_crop, round(roll_deg, 1)

    def detect_face(
        self,
        img: np.ndarray,
        use_tracking: bool = True
    ) -> Dict[str, Any]:
        """
        Full detection pipeline:
        Raw multi-scale detection -> Quality Filter -> NMS -> Duplicate Suppression -> Temporal Tracker.
        """
        if img is None or img.size == 0:
            return {
                "face_detected": False,
                "face_count": 0,
                "bbox": None,
                "eyes": [],
                "face_crop": None,
                "error_code": "INVALID_FRAME",
                "guidance": "Camera frame empty or corrupted.",
                "raw_detections_count": 0,
                "post_nms_count": 0,
                "post_duplicate_count": 0,
                "stable_tracks_count": 0,
                "stability_score": 0.0,
                "detector_version": self.detector_version
            }

        now_ts = time.time()
        if hasattr(self, "_last_detect_time") and (now_ts - self._last_detect_time > 1.2):
            self.tracker.reset()
        self._last_detect_time = now_ts

        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 1. Primary multi-scale detection with level weights
        raw_boxes_tuple = []
        raw_scores_list = []

        try:
            boxes_1, _, weights_1 = self.face_cascade.detectMultiScale3(
                gray,
                scaleFactor=1.12,
                minNeighbors=4,
                minSize=(int(w * 0.10), int(h * 0.10)),
                flags=cv2.CASCADE_SCALE_IMAGE,
                outputRejectLevels=True
            )
            for b, s in zip(boxes_1, weights_1):
                raw_boxes_tuple.append(tuple(b))
                raw_scores_list.append(float(s))
        except Exception:
            # Fallback if detectMultiScale3 not supported
            b_list = self.face_cascade.detectMultiScale(
                gray, scaleFactor=1.12, minNeighbors=4,
                minSize=(int(w * 0.10), int(h * 0.10))
            )
            for b in b_list:
                raw_boxes_tuple.append(tuple(b))
                raw_scores_list.append(5.0)

        # 2. Secondary equalization pass only if primary found 0 detections
        if len(raw_boxes_tuple) == 0:
            gray_eq = cv2.equalizeHist(gray)
            try:
                boxes_2, _, weights_2 = self.face_cascade.detectMultiScale3(
                    gray_eq,
                    scaleFactor=1.12,
                    minNeighbors=4,
                    minSize=(int(w * 0.10), int(h * 0.10)),
                    flags=cv2.CASCADE_SCALE_IMAGE,
                    outputRejectLevels=True
                )
                for b, s in zip(boxes_2, weights_2):
                    raw_boxes_tuple.append(tuple(b))
                    raw_scores_list.append(float(s) * 0.90)  # slightly discount equalized pass
            except Exception:
                pass

        raw_count = len(raw_boxes_tuple)

        # 3. Face Box Quality Filter
        qual_boxes, qual_scores = self.filter_box_quality(raw_boxes_tuple, raw_scores_list, w, h)

        # 4. Class-Aware Non-Maximum Suppression (IoU: 0.38)
        nms_boxes, nms_scores = self.apply_nms(qual_boxes, qual_scores, iou_threshold=0.38)
        post_nms_count = len(nms_boxes)

        # 5. Duplicate Face Suppression (Concentric / Nested)
        final_boxes, final_scores = self.suppress_duplicate_faces(nms_boxes, nms_scores)
        post_dup_count = len(final_boxes)

        # 6. Temporal Face Tracking
        if use_tracking:
            self.tracker.update(final_boxes, final_scores)
            confirmed_tracks = self.tracker.get_confirmed_tracks()
            active_tracks_count = len(self.tracker.tracks)
            stable_tracks_count = len(confirmed_tracks)

            # Determine primary track and stability
            primary_track = confirmed_tracks[0] if len(confirmed_tracks) > 0 else (
                self.tracker.tracks[0] if len(self.tracker.tracks) > 0 else None
            )
            stability_score = primary_track.stability_score if primary_track else 0.0
        else:
            stable_tracks_count = post_dup_count
            active_tracks_count = post_dup_count
            primary_track = None
            stability_score = 1.0 if post_dup_count == 1 else 0.0

        # 7. Evaluate Face Count Decisions based on confirmed physical entities
        # A transient 1-frame ghost detection is suppressed if there is already an active confirmed track
        effective_face_count = stable_tracks_count if use_tracking else post_dup_count

        if effective_face_count == 0:
            # Check if there is a newly detected face stabilizing in current frame
            if post_dup_count == 1 and len(self.tracker.tracks) == 1 and use_tracking:
                return {
                    "face_detected": False,
                    "face_count": 1,
                    "bbox": self.tracker.tracks[0].bbox,
                    "eyes": [],
                    "face_crop": None,
                    "error_code": "FACE_STABILIZING",
                    "guidance": "Face detected. Stabilizing track... Hold still.",
                    "raw_detections_count": raw_count,
                    "post_nms_count": post_nms_count,
                    "post_duplicate_count": post_dup_count,
                    "stable_tracks_count": 0,
                    "stability_score": stability_score,
                    "detector_version": self.detector_version
                }

            return {
                "face_detected": False,
                "face_count": 0,
                "bbox": None,
                "eyes": [],
                "face_crop": None,
                "error_code": "NO_FACE",
                "guidance": "No human face detected. Center your face in the reticle.",
                "raw_detections_count": raw_count,
                "post_nms_count": post_nms_count,
                "post_duplicate_count": post_dup_count,
                "stable_tracks_count": 0,
                "stability_score": 0.0,
                "detector_version": self.detector_version
            }

        if effective_face_count > 1:
            return {
                "face_detected": False,
                "face_count": effective_face_count,
                "bbox": None,
                "eyes": [],
                "face_crop": None,
                "error_code": "MULTIPLE_FACES",
                "guidance": f"Multiple distinct face tracks detected ({effective_face_count}). Only one person should be visible.",
                "raw_detections_count": raw_count,
                "post_nms_count": post_nms_count,
                "post_duplicate_count": post_dup_count,
                "stable_tracks_count": stable_tracks_count,
                "stability_score": stability_score,
                "detector_version": self.detector_version
            }

        # Exactly ONE confirmed face track
        selected_bbox = primary_track.bbox if primary_track else final_boxes[0]
        x, y, fw, fh = selected_bbox

        # Eye detection within face ROI for landmarks and alignment
        face_gray = gray[y:y+fh, x:x+fw]
        eyes = self.eye_cascade.detectMultiScale(
            face_gray,
            scaleFactor=1.08,
            minNeighbors=3,
            minSize=(int(fw * 0.12), int(fh * 0.12))
        )
        detected_eyes = [(int(ex + x), int(ey + y), int(ew), int(eh)) for (ex, ey, ew, eh) in eyes]

        # Landmark eye geometry sanity checks
        valid_eyes = []
        if len(detected_eyes) >= 2:
            sorted_e = sorted(detected_eyes, key=lambda e: e[0])
            e_left, e_right = sorted_e[0], sorted_e[1]
            inter_eye_dist = np.hypot((e_right[0]+e_right[2]/2) - (e_left[0]+e_left[2]/2),
                                      (e_right[1]+e_right[2]/2) - (e_left[1]+e_left[2]/2))
            inter_eye_ratio = inter_eye_dist / max(1.0, fw)
            # Eye elevation inside upper 60% of face box
            elev_left = (e_left[1] - y) / max(1.0, fh)
            elev_right = (e_right[1] - y) / max(1.0, fh)

            if 0.18 <= inter_eye_ratio <= 0.65 and 0.15 <= elev_left <= 0.60 and 0.15 <= elev_right <= 0.60:
                valid_eyes = [e_left, e_right]
            else:
                valid_eyes = detected_eyes[:2]
        else:
            valid_eyes = detected_eyes

        # Aligned face crop with horizontal roll rotation
        aligned_crop, roll_deg = self.align_face_crop(img, selected_bbox, valid_eyes)

        return {
            "face_detected": True,
            "face_count": 1,
            "bbox": (int(x), int(y), int(fw), int(fh)),
            "eyes": valid_eyes,
            "face_crop": aligned_crop,
            "roll_deg": roll_deg,
            "error_code": None,
            "guidance": "Face detected and aligned. Hold still for liveness check.",
            "raw_detections_count": raw_count,
            "post_nms_count": post_nms_count,
            "post_duplicate_count": post_dup_count,
            "stable_tracks_count": 1,
            "stability_score": stability_score,
            "detector_version": self.detector_version
        }

face_detector = FaceDetector()
