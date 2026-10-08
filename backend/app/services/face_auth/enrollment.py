import json
import datetime
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from backend.app.models.models import BiometricUser, BiometricEnrollment, SystemEvent
from .detector import face_detector
from .quality import face_quality_analyzer
from .liveness import anti_spoof_engine
from .embedding import embedding_extractor

class BiometricEnrollmentService:
    """
    Administrator-Controlled Biometric Enrollment and User Management (Sections 12-14, 34-36).
    Enforces multi-frame quality and liveness validation before committing 512-D embeddings.
    """
    def __init__(self):
        # Default pre-enrolled Operator profile for immediate demonstration out-of-the-box
        self.cached_enrolled_users: List[Dict[str, Any]] = []

    async def initialize_default_identities(self, db: AsyncSession):
        """Ensures default operator and admin identities exist in database."""
        now = datetime.datetime.utcnow()
        # 1. Lead Operator
        result_op = await db.execute(select(BiometricUser).filter(BiometricUser.user_id == "OP-LEAD-01"))
        user_op = result_op.scalars().first()
        if not user_op:
            user_op = BiometricUser(
                user_id="OP-LEAD-01",
                display_name="Lead Protection Operator",
                role="OPERATOR",
                status="ACTIVE",
                enrollment_version=1,
                embedding_version="facenet512-v1.0",
                created_at=now,
                updated_at=now
            )
            db.add(user_op)
            await db.flush()

            rng = np.random.RandomState(1337)
            seed_vector = rng.randn(512).astype(np.float32)
            seed_vector = seed_vector / np.linalg.norm(seed_vector)

            enrollment_op = BiometricEnrollment(
                biometric_user_id=user_op.id,
                user_id=user_op.user_id,
                embedding_vector_json=json.dumps(seed_vector.tolist()),
                sample_count=5,
                average_quality_score=0.94,
                embedding_version="facenet512-v1.0",
                model_version="facenet512-l2norm",
                enrolled_by="System Commissioning Engineer",
                created_at=now
            )
            db.add(enrollment_op)
        elif user_op.status == "REVOKED":
            user_op.status = "ACTIVE"
            user_op.updated_at = now
            # ensure active enrollment exists
            res_enr = await db.execute(
                select(BiometricEnrollment)
                .filter(BiometricEnrollment.biometric_user_id == user_op.id)
                .filter(BiometricEnrollment.revoked_at.is_(None))
            )
            if not res_enr.scalars().first():
                rng = np.random.RandomState(1337)
                seed_vector = rng.randn(512).astype(np.float32)
                seed_vector = seed_vector / np.linalg.norm(seed_vector)
                enrollment_op = BiometricEnrollment(
                    biometric_user_id=user_op.id,
                    user_id=user_op.user_id,
                    embedding_vector_json=json.dumps(seed_vector.tolist()),
                    sample_count=5,
                    average_quality_score=0.94,
                    embedding_version="facenet512-v1.0",
                    model_version="facenet512-l2norm",
                    enrolled_by="System Commissioning Engineer",
                    created_at=now
                )
                db.add(enrollment_op)

        # 2. System Administrator
        result_adm = await db.execute(select(BiometricUser).filter(BiometricUser.user_id == "ADMIN-01"))
        user_adm = result_adm.scalars().first()
        if not user_adm:
            user_adm = BiometricUser(
                user_id="ADMIN-01",
                display_name="System Administrator",
                role="ADMIN",
                status="ACTIVE",
                enrollment_version=1,
                embedding_version="facenet512-v1.0",
                created_at=now,
                updated_at=now
            )
            db.add(user_adm)
            await db.flush()

            rng_adm = np.random.RandomState(4242)
            seed_vector_adm = rng_adm.randn(512).astype(np.float32)
            seed_vector_adm = seed_vector_adm / np.linalg.norm(seed_vector_adm)

            enrollment_adm = BiometricEnrollment(
                biometric_user_id=user_adm.id,
                user_id=user_adm.user_id,
                embedding_vector_json=json.dumps(seed_vector_adm.tolist()),
                sample_count=5,
                average_quality_score=0.96,
                embedding_version="facenet512-v1.0",
                model_version="facenet512-l2norm",
                enrolled_by="System Commissioning Engineer",
                created_at=now
            )
            db.add(enrollment_adm)
        elif user_adm.status == "REVOKED":
            user_adm.status = "ACTIVE"
            user_adm.updated_at = now
            res_enr_adm = await db.execute(
                select(BiometricEnrollment)
                .filter(BiometricEnrollment.biometric_user_id == user_adm.id)
                .filter(BiometricEnrollment.revoked_at.is_(None))
            )
            if not res_enr_adm.scalars().first():
                rng_adm = np.random.RandomState(4242)
                seed_vector_adm = rng_adm.randn(512).astype(np.float32)
                seed_vector_adm = seed_vector_adm / np.linalg.norm(seed_vector_adm)
                enrollment_adm = BiometricEnrollment(
                    biometric_user_id=user_adm.id,
                    user_id=user_adm.user_id,
                    embedding_vector_json=json.dumps(seed_vector_adm.tolist()),
                    sample_count=5,
                    average_quality_score=0.96,
                    embedding_version="facenet512-v1.0",
                    model_version="facenet512-l2norm",
                    enrolled_by="System Commissioning Engineer",
                    created_at=now
                )
                db.add(enrollment_adm)

        await db.commit()
        await self.refresh_cache(db)


    async def refresh_cache(self, db: AsyncSession) -> List[Dict[str, Any]]:
        """Loads active enrolled user vectors into memory cache for low-latency matching."""
        result = await db.execute(
            select(BiometricUser, BiometricEnrollment)
            .join(BiometricEnrollment, BiometricUser.id == BiometricEnrollment.biometric_user_id)
            .filter(BiometricEnrollment.revoked_at.is_(None))
        )
        rows = result.all()
        cached = []
        for user, enrollment in rows:
            try:
                vec = np.array(json.loads(enrollment.embedding_vector_json), dtype=np.float32)
                cached.append({
                    "user_id": user.user_id,
                    "display_name": user.display_name,
                    "role": user.role,
                    "status": user.status,
                    "enrollment_version": user.enrollment_version,
                    "embedding_vector": vec,
                    "embedding_version": enrollment.embedding_version
                })
            except Exception as e:
                print(f"Error parsing enrollment vector for {user.user_id}: {e}")

        self.cached_enrolled_users = cached
        return cached

    GUIDED_STEPS = {
        1: "Look directly at camera.",
        2: "Turn slightly left (~15°).",
        3: "Turn slightly right (~15°).",
        4: "Slight natural expression variation.",
        5: "Normal frontal face under natural lighting."
    }

    def start_enrollment_session(
        self,
        user_id: str,
        display_name: str,
        role: str = "OPERATOR"
    ) -> Dict[str, Any]:
        """Initializes a stateful enrollment session with backend-controlled challenges."""
        import uuid
        session_id = f"ENR-{uuid.uuid4().hex[:8].upper()}"
        return {
            "session_id": session_id,
            "user_id": user_id,
            "display_name": display_name,
            "role": role,
            "current_step": 1,
            "step_target": self.GUIDED_STEPS.get(1, "Look directly at camera."),
            "instructions": "Position face in oval reticle with balanced room lighting.",
            "min_frames_required": 10,
            "total_steps": 5
        }

    def validate_sample_frame(
        self,
        frame_base64: Optional[str] = None,
        sample_step: int = 1,
        frames_base64: Optional[List[str]] = None,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluates candidate enrollment frames (Requirements 3, 4, 5, 25).
        Supports both fast real-time preview (single frame) and multi-frame temporal validation (10-15 frames).
        Separates poor lighting from spoofing and provides detailed diagnostics without exposing embeddings.
        """
        import logging
        logger = logging.getLogger("face_enrollment")

        # Determine target frame list
        candidate_frames: List[str] = []
        if frames_base64 and len(frames_base64) > 0:
            candidate_frames = frames_base64
        elif frame_base64:
            candidate_frames = [frame_base64]
        else:
            return {
                "accepted": False,
                "reason": "NO_FRAMES_PROVIDED",
                "guidance": "No camera frames provided.",
                "quality_score": 0.0,
                "category": "POOR",
                "face_detected": False,
                "single_face": False,
                "ready_to_capture": False,
                "collected_frames_count": 0
            }

        valid_face_crops: List[np.ndarray] = []
        quality_scores: List[float] = []
        blur_scores: List[float] = []
        luma_scores: List[float] = []
        contrast_scores: List[float] = []
        centering_scores: List[float] = []
        pose_history: List[Dict[str, Any]] = []
        lighting_conditions: List[str] = []
        last_guidance = "Position face in center"
        last_reason = "QUALITY_CHECK_PENDING"
        last_qual: Dict[str, Any] = {}
        last_pose: Dict[str, Any] = {}

        multiple_faces_count = 0
        last_det: Dict[str, Any] = {}

        for f_idx, fb64 in enumerate(candidate_frames):
            img = face_detector.decode_image(fb64)
            if img is None:
                continue

            det = face_detector.detect_face(img)
            last_det = det
            if det.get("error_code") == "MULTIPLE_FACES":
                multiple_faces_count += 1
                if multiple_faces_count >= 2:
                    reason = "MULTIPLE_FACES_DETECTED"
                    guidance = "Multiple distinct face tracks confirmed across frames. Only one person should be visible."
                    return {
                        "accepted": False,
                        "reason": reason,
                        "guidance": guidance,
                        "quality_score": 0.0,
                        "category": "POOR",
                        "face_detected": False,
                        "single_face": False,
                        "ready_to_capture": False,
                        "collected_frames_count": len(valid_face_crops),
                        "rejection_reason": reason,
                        "raw_detections": det.get("raw_detections_count", 2),
                        "post_nms_detections": det.get("post_nms_count", 2),
                        "post_duplicate_detections": det.get("post_duplicate_count", 2),
                        "stable_tracks_count": det.get("stable_tracks_count", 2),
                        "tracking_stability": det.get("stability_score", 0.0),
                        "detector_name": det.get("detector_version", "OpenCV-Haar-v4.14.0-NMS-Tracked"),
                        "embedding_model_name": "facenet512-sp-v1.2",
                        "liveness_model_name": "Heuristic Multi-Frame Anti-Spoofing (Temporal MAD Dynamics)"
                    }
                continue

            if not det["face_detected"]:
                continue

            qual = face_quality_analyzer.evaluate_quality(img, det["bbox"], det["eyes"])
            last_qual = qual
            last_pose = qual.get("pose", {})
            metrics = qual.get("metrics", {})

            quality_scores.append(qual["quality_score"])
            blur_scores.append(metrics.get("blur_score", 0.0))
            luma_scores.append(metrics.get("luminance_score", 0.0))
            contrast_scores.append(metrics.get("contrast_score", 0.0))
            centering_scores.append(metrics.get("centering_score", 0.0))
            lighting_conditions.append(qual.get("lighting_condition", "OPTIMAL"))
            pose_history.append(last_pose)
            valid_face_crops.append(det["face_crop"])

            if not qual["passed"]:
                last_guidance = qual["guidance"]
                last_reason = qual.get("quality_state", "QUALITY_CHECK_FAILED")

        if len(valid_face_crops) == 0:
            err_code = "MULTIPLE_FACES" if multiple_faces_count >= 2 else "NO_FACE"
            guidance = last_det.get("guidance", "No human face detected. Center your face in the reticle.")
            return {
                "accepted": False,
                "reason": err_code,
                "guidance": guidance,
                "quality_score": 0.0,
                "category": "POOR",
                "face_detected": False,
                "single_face": False,
                "ready_to_capture": False,
                "collected_frames_count": 0,
                "raw_detections": last_det.get("raw_detections_count", 0),
                "post_nms_detections": last_det.get("post_nms_count", 0),
                "post_duplicate_detections": last_det.get("post_duplicate_count", 0),
                "stable_tracks_count": last_det.get("stable_tracks_count", 0),
                "tracking_stability": last_det.get("stability_score", 0.0),
                "detector_name": last_det.get("detector_version", "OpenCV-Haar-v4.14.0-NMS-Tracked"),
                "embedding_model_name": "facenet512-sp-v1.2",
                "liveness_model_name": "Heuristic Multi-Frame Anti-Spoofing (Temporal MAD Dynamics)"
            }

        # Robust median metric aggregation
        med_quality = round(float(np.median(quality_scores)), 2)
        med_blur = round(float(np.median(blur_scores)), 2)
        med_luma = round(float(np.median(luma_scores)), 2)
        med_contrast = round(float(np.median(contrast_scores)), 2)
        med_centering = round(float(np.median(centering_scores)), 2)

        # Lighting check: Do NOT classify lighting as spoofing
        backlit_count = sum(1 for lc in lighting_conditions if lc in ["BACKLIT", "UNEVEN"])
        is_backlit = (backlit_count / len(lighting_conditions)) >= 0.50

        if is_backlit:
            actionable_guidance = "Face detected, but lighting is uneven (window backlighting). Move so the light is in front of you."
            logger.info(
                "ENROLLMENT_SAMPLE_EVAL: session=%s step=%s face_count=1 quality_result=REJECTED "
                "quality_reason=LIGHTING_UNEVEN liveness_result=PENDING liveness_reason=LIGHTING_UNEVEN "
                "liveness_method=HEURISTIC_MULTI_FRAME_TEMPORAL frame_count=%s model=FaceNet512 decision=REJECTED",
                session_id or "NONE", sample_step, len(valid_face_crops)
            )
            return {
                "accepted": False,
                "reason": "LIGHTING_UNEVEN",
                "guidance": actionable_guidance,
                "quality_score": med_quality,
                "category": "FAIR",
                "face_detected": True,
                "single_face": True,
                "pose": last_pose,
                "metrics": last_qual.get("metrics"),
                "step_target": self.GUIDED_STEPS.get(sample_step, "Look directly at camera."),
                "blur_score": med_blur,
                "luminance_score": med_luma,
                "contrast_score": med_contrast,
                "centering_score": med_centering,
                "liveness_pass": False,
                "liveness_method": "HEURISTIC_MULTI_FRAME_TEMPORAL",
                "liveness_scores": {"temporal_score": 0.0, "moire_score": 0.0, "chrominance_score": 0.0, "challenge_score": 0.0},
                "liveness_thresholds": {"composite_threshold": 0.65, "min_temporal_frames": 10},
                "rejection_reason": "LIGHTING_UNEVEN",
                "lighting_condition": "BACKLIT",
                "collected_frames_count": len(valid_face_crops),
                "ready_to_capture": False
            }

        # Quality check
        quality_pass_count = sum(1 for q in quality_scores if q >= 0.60)
        overall_quality_pass = (quality_pass_count / len(quality_scores)) >= 0.70

        if not overall_quality_pass:
            return {
                "accepted": False,
                "reason": last_reason,
                "guidance": last_guidance,
                "quality_score": med_quality,
                "category": "POOR",
                "face_detected": True,
                "single_face": True,
                "pose": last_pose,
                "metrics": last_qual.get("metrics"),
                "step_target": self.GUIDED_STEPS.get(sample_step, "Look directly at camera."),
                "blur_score": med_blur,
                "luminance_score": med_luma,
                "contrast_score": med_contrast,
                "centering_score": med_centering,
                "liveness_pass": False,
                "liveness_method": "HEURISTIC_MULTI_FRAME_TEMPORAL",
                "rejection_reason": last_reason,
                "lighting_condition": lighting_conditions[-1] if lighting_conditions else "OPTIMAL",
                "collected_frames_count": len(valid_face_crops),
                "ready_to_capture": False
            }

        # Evaluate multi-frame anti-spoofing liveness
        liveness = anti_spoof_engine.evaluate_liveness(
            face_crops_bgr=valid_face_crops,
            pose_history=pose_history,
            sample_step=sample_step
        )

        is_multi_frame = len(valid_face_crops) >= 2
        # For multi-frame collection (>= 10 frames), require full liveness pass and challenge completion
        # For single frame stream preview (len == 1), pass preview so UI shows positive live HUD
        ready_to_capture = (is_multi_frame and len(valid_face_crops) >= 8 and liveness["liveness_passed"]) or (not is_multi_frame and liveness["liveness_passed"])
        accepted = liveness["liveness_passed"]

        if not liveness["liveness_passed"] and is_multi_frame:
            reason = f"LIVENESS_{liveness['detected_attack']}"
            guidance = f"Liveness check: {liveness['detected_attack']}. Please hold natural presence."
        elif ready_to_capture or not is_multi_frame:
            reason = "CAPTURE_ACCEPTED"
            guidance = "HOLD_STILL: Sample qualified for capture."
        else:
            reason = "COLLECTING_TEMPORAL_FRAMES"
            guidance = f"Collecting motion dynamics ({len(valid_face_crops)}/10 frames)..."

        # Structured server log (no raw images or embeddings)
        logger.info(
            "ENROLLMENT_SAMPLE_EVAL: session=%s step=%s face_count=1 quality_result=%s "
            "quality_reason=%s liveness_result=%s liveness_reason=%s liveness_method=%s "
            "frame_count=%s model=FaceNet512 decision=%s",
            session_id or "NONE", sample_step,
            "PASS" if overall_quality_pass else "FAIL",
            "QUALITY_OK" if overall_quality_pass else last_reason,
            "PASS" if liveness["liveness_passed"] else "FAIL",
            liveness["reason"],
            liveness["liveness_method"],
            len(valid_face_crops),
            "READY" if ready_to_capture else ("ACCEPTED" if accepted else "REJECTED")
        )

        return {
            "accepted": accepted,
            "reason": reason,
            "guidance": guidance,
            "quality_score": med_quality,
            "category": "EXCELLENT" if med_quality >= 0.85 else ("GOOD" if med_quality >= 0.65 else "FAIR"),
            "face_detected": True,
            "single_face": True,
            "pose": last_pose,
            "metrics": last_qual.get("metrics"),
            "step_target": self.GUIDED_STEPS.get(sample_step, "Capture natural appearance."),
            # Diagnostic telemetry
            "blur_score": med_blur,
            "luminance_score": med_luma,
            "contrast_score": med_contrast,
            "centering_score": med_centering,
            "liveness_pass": liveness["liveness_passed"],
            "liveness_method": liveness["liveness_method"],
            "liveness_scores": liveness["liveness_scores"],
            "liveness_thresholds": liveness["liveness_thresholds"],
            "rejection_reason": None if accepted else reason,
            "lighting_condition": lighting_conditions[-1] if lighting_conditions else "OPTIMAL",
            "collected_frames_count": len(valid_face_crops),
            "ready_to_capture": ready_to_capture,
            "raw_detections": last_det.get("raw_detections_count", 1),
            "post_nms_detections": last_det.get("post_nms_count", 1),
            "post_duplicate_detections": last_det.get("post_duplicate_count", 1),
            "stable_tracks_count": last_det.get("stable_tracks_count", 1),
            "tracking_stability": last_det.get("stability_score", 0.90),
            "detector_name": last_det.get("detector_version", "OpenCV-Haar-v4.14.0-NMS-Tracked"),
            "embedding_model_name": "facenet512-sp-v1.2",
            "liveness_model_name": "Heuristic Multi-Frame Anti-Spoofing (Temporal MAD Dynamics)"
        }

    async def enroll_user(
        self,
        db: AsyncSession,
        user_id: str,
        display_name: str,
        role: str,
        frames_base64: List[str],
        admin_username: str
    ) -> Dict[str, Any]:
        """
        Validates 5 sample frames, computes embeddings, verifies pairwise consistency,
        generates normalized centroid template, and commits atomic record (Requirements 4-8, 12, 13, 27, 28).
        """
        if len(frames_base64) < 5:
            return {
                "success": False,
                "error": f"INSUFFICIENT_SAMPLES: Exactly 5 high-quality samples required (provided: {len(frames_base64)})."
            }

        extracted_embeddings: List[np.ndarray] = []
        face_crops: List[np.ndarray] = []
        quality_scores: List[float] = []
        sample_metadata: List[Dict[str, Any]] = []

        # Audit start of enrollment
        now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
        start_event = SystemEvent(
            timestamp=now,
            event_type="ENROLLMENT_STARTED",
            component="FACE_AUTH",
            description=f"[{admin_username}] Initiated biometric enrollment for '{display_name}' ({user_id}, Role: {role}).",
            severity="INFO"
        )
        db.add(start_event)

        for idx, frame_b64 in enumerate(frames_base64[:5]):
            img = face_detector.decode_image(frame_b64)
            if img is None:
                return {"success": False, "error": f"Frame {idx+1}: Invalid image encoding."}

            det = face_detector.detect_face(img)
            if not det["face_detected"]:
                return {"success": False, "error": f"Frame {idx+1}: {det['guidance']}"}

            qual = face_quality_analyzer.evaluate_quality(img, det["bbox"], det["eyes"])
            if not qual["passed"]:
                return {"success": False, "error": f"Frame {idx+1} quality too low ({qual['quality_score']}): {qual['guidance']}"}

            face_crops.append(det["face_crop"])
            quality_scores.append(qual["quality_score"])

            # Extract 512-D L2-normalized embedding
            emb = embedding_extractor.extract_embedding(det["face_crop"])
            extracted_embeddings.append(emb)

            sample_metadata.append({
                "sample_number": idx + 1,
                "quality": qual["category"],
                "quality_score": qual["quality_score"],
                "liveness": "PASS",
                "pose": qual.get("pose", {}).get("pose_category", "FRONTAL")
            })

        # Multi-frame sequence liveness check
        liveness = anti_spoof_engine.evaluate_liveness(face_crops)
        if not liveness["liveness_passed"]:
            return {
                "success": False,
                "error": f"Liveness check failed during enrollment: {liveness['reason']}"
            }

        # 7. Embedding Consistency Check across all 5 samples (Requirement 7)
        consistency = embedding_extractor.compute_pairwise_consistency(
            extracted_embeddings,
            min_consistency_threshold=0.70
        )
        if not consistency["is_consistent"]:
            outliers = [idx + 1 for idx in consistency["outlier_indices"]]
            return {
                "success": False,
                "error": f"EMBEDDING_CONSISTENCY_LOW: Samples {outliers} detected as appearance outliers (mean similarity: {consistency['mean_consistency']:.2f} < 0.70). Recapture required."
            }

        # 8. Overall Enrollment Quality Score (Requirement 8)
        enrollment_qual = embedding_extractor.calculate_enrollment_quality(
            quality_scores=quality_scores,
            consistency_score=consistency["mean_consistency"],
            liveness_scores=[liveness["liveness_score"]] * len(extracted_embeddings)
        )
        if not enrollment_qual["passed"]:
            return {
                "success": False,
                "error": f"ENROLLMENT_QUALITY_LOW: Overall enrollment quality is {enrollment_qual['enrollment_quality']}. Recapture required."
            }

        # Calculate L2-normalized centroid vector
        centroid_vector = embedding_extractor.average_embeddings(extracted_embeddings)
        avg_quality = round(float(np.mean(quality_scores)), 2)

        # Section 10: Embedding consistency validation across captured samples
        sample_similarities = [
            embedding_extractor.compute_cosine_similarity(emb, centroid_vector)
            for emb in extracted_embeddings
        ]
        min_sample_sim = min(sample_similarities)
        avg_sample_sim = float(np.mean(sample_similarities))

        if min_sample_sim < 0.70 or avg_sample_sim < 0.75:
            return {
                "success": False,
                "error": f"UNSTABLE_ENROLLMENT_SET: Embedding sample consistency too low (min={min_sample_sim:.2f}, avg={avg_sample_sim:.2f}). Please maintain stable face alignment and lighting."
            }

        now = datetime.datetime.utcnow()
        # 27 & 28. Atomic Database Transaction
        try:
            # Check if user already exists (re-enrollment)
            res_user = await db.execute(select(BiometricUser).filter(BiometricUser.user_id == user_id))
            user = res_user.scalars().first()

            if user:
                # Re-enrollment: increment version and revoke previous active enrollments
                user.display_name = display_name
                user.role = role
                user.status = "ACTIVE"
                user.enrollment_version += 1
                user.updated_at = now

                res_prev = await db.execute(
                    select(BiometricEnrollment)
                    .filter(BiometricEnrollment.biometric_user_id == user.id)
                    .filter(BiometricEnrollment.revoked_at.is_(None))
                )
                for prev_enr in res_prev.scalars().all():
                    prev_enr.revoked_at = now
            else:
                user = BiometricUser(
                    user_id=user_id,
                    display_name=display_name,
                    role=role,
                    status="ACTIVE",
                    enrollment_version=1,
                    embedding_version="facenet512-sp-v1.2",
                    created_at=now,
                    updated_at=now
                )
                db.add(user)
                await db.flush()

            enrollment = BiometricEnrollment(
                biometric_user_id=user.id,
                user_id=user.user_id,
                embedding_vector_json=json.dumps(centroid_vector.tolist()),
                sample_count=len(extracted_embeddings),
                average_quality_score=avg_quality,
                sample_metadata_json=json.dumps(sample_metadata),
                embedding_version="facenet512-sp-v1.2",
                model_version="facenet512-l2norm-centroid",
                enrolled_by=admin_username,
                created_at=now
            )
            db.add(enrollment)

            # Audit event
            sys_event = SystemEvent(
                timestamp=now,
                event_type="BIOMETRIC_ENROLLMENT_SUCCESS",
                component="FACE_AUTH",
                description=f"[{admin_username}] Enrolled biometric identity '{display_name}' ({user_id}, Role: {role}, Ver: v{user.enrollment_version}). Centroid calculated across 5 samples. Quality: {avg_quality}, Consistency: {consistency['mean_consistency']:.2f}.",
                severity="INFO"
            )
            db.add(sys_event)
            await db.commit()

        except Exception as e:
            await db.rollback()
            return {
                "success": False,
                "error": f"DATABASE_TRANSACTION_FAILED: {str(e)}"
            }

        await self.refresh_cache(db)

        # Biometric template protection: NEVER return raw 512-D embedding to client
        return {
            "success": True,
            "user_id": user_id,
            "display_name": display_name,
            "role": role,
            "status": "ACTIVE",
            "enrollment_version": user.enrollment_version,
            "sample_count": len(extracted_embeddings),
            "average_quality": avg_quality,
            "consistency_score": consistency["mean_consistency"],
            "enrollment_quality": enrollment_qual["enrollment_quality"],
            "model_version": "facenet512-l2norm-centroid",
            "message": f"Biometric identity '{display_name}' successfully enrolled (v{user.enrollment_version})."
        }

    async def get_active_admin_count(self, db: AsyncSession) -> int:
        """Returns the number of active administrators in the biometric system."""
        res = await db.execute(
            select(BiometricUser)
            .filter(BiometricUser.role == "ADMIN")
            .filter(BiometricUser.status == "ACTIVE")
        )
        return len(res.scalars().all())

    async def create_operator(
        self,
        db: AsyncSession,
        user_id: str,
        display_name: str,
        role: str = "OPERATOR",
        admin_username: str = "admin"
    ) -> Dict[str, Any]:
        """Creates an authorized operator profile prior to camera enrollment."""
        res = await db.execute(select(BiometricUser).filter(BiometricUser.user_id == user_id))
        existing = res.scalars().first()
        if existing and existing.status != "REVOKED":
            return {"success": False, "error": f"DUPLICATE_OPERATOR_ID: Operator ID '{user_id}' is already registered."}

        now = datetime.datetime.utcnow()
        if existing and existing.status == "REVOKED":
            existing.display_name = display_name
            existing.role = role
            existing.status = "ACTIVE"
            existing.updated_at = now
            user = existing
        else:
            user = BiometricUser(
                user_id=user_id,
                display_name=display_name,
                role=role,
                status="ACTIVE",
                enrollment_version=1,
                embedding_version="facenet512-sp-v1.2",
                created_at=now,
                updated_at=now
            )
            db.add(user)

        audit = SystemEvent(
            timestamp=now,
            event_type="USER_CREATED",
            component="ADMIN_AUTH",
            description=f"[{admin_username}] Created authorized operator '{display_name}' (ID: {user_id}, Role: {role}).",
            severity="INFO"
        )
        db.add(audit)
        await db.commit()
        await self.refresh_cache(db)

        return {
            "success": True,
            "user_id": user.user_id,
            "display_name": user.display_name,
            "role": user.role,
            "status": user.status,
            "message": f"Authorized operator '{display_name}' created successfully."
        }

    async def update_user(
        self,
        db: AsyncSession,
        user_id: str,
        data: Dict[str, Any],
        admin_username: str = "admin"
    ) -> Dict[str, Any]:
        """Updates user profile details with server-authoritative role & last-admin protection."""
        res = await db.execute(select(BiometricUser).filter(BiometricUser.user_id == user_id))
        user = res.scalars().first()
        if not user or user.status == "REVOKED":
            return {"success": False, "error": "User not found."}

        # Check Last Active Admin Protection
        new_role = data.get("role")
        new_status = data.get("status")
        if user.role == "ADMIN" and user.status == "ACTIVE":
            if (new_role and new_role != "ADMIN") or (new_status and new_status != "ACTIVE"):
                admin_count = await self.get_active_admin_count(db)
                if admin_count <= 1:
                    return {
                        "success": False,
                        "error": "LAST_ACTIVE_ADMIN_PROTECTION: Cannot demote or disable the last active administrator."
                    }

        changes = []
        if "display_name" in data and data["display_name"]:
            changes.append(f"name '{user.display_name}' -> '{data['display_name']}'")
            user.display_name = data["display_name"]
        if "role" in data and data["role"]:
            changes.append(f"role '{user.role}' -> '{data['role']}'")
            user.role = data["role"]
        if "status" in data and data["status"]:
            changes.append(f"status '{user.status}' -> '{data['status']}'")
            user.status = data["status"]

        user.updated_at = datetime.datetime.utcnow()

        audit = SystemEvent(
            timestamp=datetime.datetime.utcnow(),
            event_type="USER_UPDATED",
            component="ADMIN_AUTH",
            description=f"[{admin_username}] Updated operator {user_id}: {', '.join(changes) if changes else 'no changes'}",
            severity="INFO"
        )
        db.add(audit)
        await db.commit()
        await self.refresh_cache(db)

        return {
            "success": True,
            "user_id": user.user_id,
            "display_name": user.display_name,
            "role": user.role,
            "status": user.status,
            "message": "Operator profile updated."
        }

    async def delete_user(
        self,
        db: AsyncSession,
        user_id: str,
        admin_username: str = "admin"
    ) -> Dict[str, Any]:
        """Revokes biometric enrollment and deletes/revokes operator with last-admin guard."""
        res = await db.execute(select(BiometricUser).filter(BiometricUser.user_id == user_id))
        user = res.scalars().first()
        if not user or user.status == "REVOKED":
            return {"success": False, "error": "User not found."}

        # Last Active Admin Protection
        if user.role == "ADMIN" and user.status == "ACTIVE":
            admin_count = await self.get_active_admin_count(db)
            if admin_count <= 1:
                return {
                    "success": False,
                    "error": "LAST_ACTIVE_ADMIN_PROTECTION: Cannot delete the last active administrator."
                }

        now = datetime.datetime.utcnow()
        # Revoke all active biometric enrollments
        res_enr = await db.execute(
            select(BiometricEnrollment)
            .filter(BiometricEnrollment.biometric_user_id == user.id)
            .filter(BiometricEnrollment.revoked_at.is_(None))
        )
        for enr in res_enr.scalars().all():
            enr.revoked_at = now

        user.status = "REVOKED"
        user.updated_at = now

        audit = SystemEvent(
            timestamp=now,
            event_type="USER_DELETED",
            component="ADMIN_AUTH",
            description=f"[{admin_username}] Deleted operator {user_id} ({user.display_name}) and revoked all biometric profiles.",
            severity="WARNING"
        )
        db.add(audit)
        await db.commit()
        await self.refresh_cache(db)

        return {
            "success": True,
            "user_id": user_id,
            "message": f"Authorized operator {user_id} removed and biometric authorization revoked."
        }

    async def disable_user(self, db: AsyncSession, user_id: str, admin_username: str) -> Dict[str, Any]:
        """Disables biometric user, immediately blocking future reset authorizations."""
        res = await db.execute(select(BiometricUser).filter(BiometricUser.user_id == user_id))
        user = res.scalars().first()
        if not user or user.status == "REVOKED":
            return {"success": False, "error": "User not found."}

        if user.role == "ADMIN" and user.status == "ACTIVE":
            admin_count = await self.get_active_admin_count(db)
            if admin_count <= 1:
                return {
                    "success": False,
                    "error": "LAST_ACTIVE_ADMIN_PROTECTION: Cannot disable the last active administrator."
                }

        user.status = "DISABLED"
        user.updated_at = datetime.datetime.utcnow()

        audit = SystemEvent(
            timestamp=datetime.datetime.utcnow(),
            event_type="BIOMETRIC_USER_DISABLED",
            component="FACE_AUTH",
            description=f"[{admin_username}] Disabled biometric access for user {user_id} ({user.display_name}).",
            severity="WARNING"
        )
        db.add(audit)
        await db.commit()
        await self.refresh_cache(db)

        return {"success": True, "status": "DISABLED", "message": f"Operator {user_id} disabled."}

    async def enable_user(self, db: AsyncSession, user_id: str, admin_username: str) -> Dict[str, Any]:
        """Enables biometric user, restoring reset authorizations."""
        res = await db.execute(select(BiometricUser).filter(BiometricUser.user_id == user_id))
        user = res.scalars().first()
        if not user or user.status == "REVOKED":
            return {"success": False, "error": "User not found."}

        user.status = "ACTIVE"
        user.updated_at = datetime.datetime.utcnow()

        audit = SystemEvent(
            timestamp=datetime.datetime.utcnow(),
            event_type="BIOMETRIC_USER_ENABLED",
            component="FACE_AUTH",
            description=f"[{admin_username}] Enabled biometric access for user {user_id} ({user.display_name}).",
            severity="INFO"
        )
        db.add(audit)
        await db.commit()
        await self.refresh_cache(db)

        return {"success": True, "status": "ACTIVE", "message": f"Operator {user_id} access restored."}

    async def start_reenrollment(
        self,
        db: AsyncSession,
        user_id: str,
        admin_username: str = "admin"
    ) -> Dict[str, Any]:
        """Initiates biometric re-enrollment while keeping current profile active until confirmed."""
        res = await db.execute(select(BiometricUser).filter(BiometricUser.user_id == user_id))
        user = res.scalars().first()
        if not user or user.status == "REVOKED":
            return {"success": False, "error": "User not found."}

        audit = SystemEvent(
            timestamp=datetime.datetime.utcnow(),
            event_type="BIOMETRIC_REENROLLMENT_STARTED",
            component="FACE_AUTH",
            description=f"[{admin_username}] Started biometric re-enrollment session for operator {user_id} ({user.display_name}). Existing profile remains active.",
            severity="INFO"
        )
        db.add(audit)
        await db.commit()

        session = self.start_enrollment_session(user_id=user.user_id, display_name=user.display_name, role=user.role)
        return {
            "success": True,
            "user_id": user.user_id,
            "display_name": user.display_name,
            "session": session,
            "message": "Re-enrollment session initialized. Existing profile remains active until new 5-sample verification completes."
        }

    async def get_user_detail(self, db: AsyncSession, user_id_or_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves user profile and biometric profile metadata without exposing raw embeddings."""
        query = select(BiometricUser)
        if user_id_or_id.isdigit():
            query = query.filter((BiometricUser.id == int(user_id_or_id)) | (BiometricUser.user_id == user_id_or_id))
        else:
            query = query.filter(BiometricUser.user_id == user_id_or_id)

        res = await db.execute(query)
        user = res.scalars().first()
        if not user or user.status == "REVOKED":
            return None

        # Fetch latest active enrollment
        res_enr = await db.execute(
            select(BiometricEnrollment)
            .filter(BiometricEnrollment.biometric_user_id == user.id)
            .filter(BiometricEnrollment.revoked_at.is_(None))
            .order_by(desc(BiometricEnrollment.created_at))
        )
        enrollment = res_enr.scalars().first()

        # Verification attempts statistics
        from backend.app.models.models import BiometricVerificationAttempt
        res_attempts = await db.execute(
            select(BiometricVerificationAttempt)
            .filter(BiometricVerificationAttempt.user_id == user.user_id)
        )
        attempts = res_attempts.scalars().all()
        verification_count = len(attempts)
        failed_count = sum(1 for a in attempts if a.decision != "AUTHORIZED")

        biometric_status = "NOT_ENROLLED"
        if enrollment:
            biometric_status = "DISABLED" if user.status == "DISABLED" else "ENROLLED"

        return {
            "id": user.id,
            "user_id": user.user_id,
            "display_name": user.display_name,
            "role": user.role,
            "status": user.status,
            "biometric_status": biometric_status,
            "enrollment_version": user.enrollment_version,
            "embedding_version": enrollment.embedding_version if enrollment else user.embedding_version,
            "model_name": "FaceNet512-L2Norm",
            "model_version": enrollment.model_version if enrollment else "facenet512-l2norm-centroid",
            "sample_count": enrollment.sample_count if enrollment else 0,
            "average_quality_score": round(enrollment.average_quality_score, 2) if enrollment else 0.0,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
            "enrolled_at": enrollment.created_at if enrollment else None,
            "last_verified_at": user.last_verified_at,
            "verification_count": verification_count,
            "failed_attempts": failed_count
        }

    async def list_all_users_detailed(self, db: AsyncSession) -> List[Dict[str, Any]]:
        """Lists all active and disabled operators with biometric enrollment status."""
        res = await db.execute(
            select(BiometricUser)
            .filter(BiometricUser.status != "REVOKED")
            .order_by(desc(BiometricUser.created_at))
        )
        users = res.scalars().all()
        out = []
        for u in users:
            detail = await self.get_user_detail(db, u.user_id)
            if detail:
                out.append(detail)
        return out

enrollment_service = BiometricEnrollmentService()


