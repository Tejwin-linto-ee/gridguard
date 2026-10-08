import uuid
import datetime
import numpy as np
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.models.models import (
    BiometricVerificationAttempt, ResetRequest, ResetAuthorization, SystemEvent
)
from .detector import face_detector
from .quality import face_quality_analyzer
from .liveness import anti_spoof_engine
from .embedding import embedding_extractor
from .matcher import face_matcher
from .policy import reset_policy_engine
from .enrollment import enrollment_service

class FaceVerificationService:
    """
    Core Biometric Face Verification Orchestrator (Sections 15-20, 28, 39).
    Executes server-authoritative multi-stage verification:
    1. Single-face check
    2. Quality metrics check
    3. Multi-frame anti-spoofing liveness check
    4. 512-D FaceNet512 embedding extraction
    5. Cosine similarity match against enrolled authorized identities
    6. RBAC & disabled account check
    7. Rate-limit enforcement
    8. One-time reset token generation
    """
    def __init__(self):
        self.session_requests: Dict[str, Dict[str, Any]] = {}

    def create_reset_session(
        self,
        channel_id: Optional[int] = None,
        fault_id: str = "FLT-CURRENT-LATCHED",
        requested_by: str = "Lead Operator",
        channel_ids: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """Creates a stateful reset session bound to specific channels and fault (Section 21)."""
        channels = list(channel_ids) if channel_ids else ([channel_id] if channel_id is not None else [1])
        ch_label = "-".join(str(c) for c in sorted(channels))
        request_id = f"RST-CH{ch_label}-{uuid.uuid4().hex[:8].upper()}"
        session_nonce = uuid.uuid4().hex
        now = datetime.datetime.utcnow()
        expires_at = now + datetime.timedelta(minutes=5)

        session_data = {
            "request_id": request_id,
            "channel_id": channels[0] if len(channels) == 1 else None,
            "channel_ids": sorted(channels),
            "fault_id": fault_id,
            "requested_by": requested_by,
            "session_nonce": session_nonce,
            "status": "PENDING",
            "created_at": now.isoformat(),
            "expires_at": expires_at.isoformat()
        }
        self.session_requests[request_id] = session_data
        return session_data

    def process_single_frame_feedback(self, frame_base64: str) -> Dict[str, Any]:
        """
        Fast frame analysis for real-time camera HUD feedback.
        Returns face box, quality metrics, guidance, and full tracking telemetry.
        """
        img = face_detector.decode_image(frame_base64)
        if img is None:
            return {
                "face_detected": False,
                "face_count": 0,
                "bbox": None,
                "quality_score": 0.0,
                "category": "POOR",
                "guidance": "INVALID_IMAGE_FRAME",
                "liveness_hint": "CHECKING",
                "raw_detections": 0,
                "post_nms_detections": 0,
                "post_duplicate_detections": 0,
                "stable_tracks_count": 0,
                "tracking_stability": 0.0,
                "detector_name": face_detector.detector_version,
                "embedding_model_name": "facenet512-sp-v1.2",
                "liveness_model_name": "Heuristic Multi-Frame Anti-Spoofing (Temporal MAD Dynamics)"
            }

        det = face_detector.detect_face(img)
        if not det["face_detected"]:
            return {
                "face_detected": False,
                "face_count": det["face_count"],
                "bbox": det.get("bbox"),
                "quality_score": 0.0,
                "category": "POOR",
                "guidance": det["guidance"],
                "liveness_hint": "WAITING_FOR_FACE",
                "raw_detections": det.get("raw_detections_count", 0),
                "post_nms_detections": det.get("post_nms_count", 0),
                "post_duplicate_detections": det.get("post_duplicate_count", 0),
                "stable_tracks_count": det.get("stable_tracks_count", 0),
                "tracking_stability": det.get("stability_score", 0.0),
                "detector_name": det.get("detector_version", face_detector.detector_version),
                "embedding_model_name": "facenet512-sp-v1.2",
                "liveness_model_name": "Heuristic Multi-Frame Anti-Spoofing (Temporal MAD Dynamics)"
            }

        qual = face_quality_analyzer.evaluate_quality(img, det["bbox"], det["eyes"])

        return {
            "face_detected": True,
            "face_count": 1,
            "bbox": det["bbox"],
            "quality_score": qual["quality_score"],
            "category": qual["category"],
            "guidance": det.get("guidance") or qual["guidance"],
            "liveness_hint": "FACE_ACQUIRED",
            "raw_detections": det.get("raw_detections_count", 1),
            "post_nms_detections": det.get("post_nms_count", 1),
            "post_duplicate_detections": det.get("post_duplicate_count", 1),
            "stable_tracks_count": det.get("stable_tracks_count", 1),
            "tracking_stability": det.get("stability_score", 0.85),
            "detector_name": det.get("detector_version", face_detector.detector_version),
            "embedding_model_name": "facenet512-sp-v1.2",
            "liveness_model_name": "Heuristic Multi-Frame Anti-Spoofing (Temporal MAD Dynamics)"
        }

    async def verify_and_authorize_reset(
        self,
        db: AsyncSession,
        request_id: str,
        frames_base64: List[str],
        client_session_id: str = "web-client"
    ) -> Dict[str, Any]:
        """
        Complete server-authoritative multi-frame biometric verification.
        Fails closed on any error or uncertainty.
        """
        attempt_id = f"ATT-{uuid.uuid4().hex[:8].upper()}"
        now = datetime.datetime.utcnow()

        # 1. Retrieve session request
        session = self.session_requests.get(request_id)
        if not session:
            return {
                "attempt_id": attempt_id,
                "decision": "DENIED",
                "authorized": False,
                "failure_reason": "INVALID_SESSION: Reset session does not exist or has expired.",
                "timestamp": now.isoformat()
            }

        channel_id = session["channel_id"]
        fault_id = session["fault_id"]
        rate_key = f"CH{channel_id}_{client_session_id}"

        # 2. Check rate limit
        allowed, rate_err = reset_policy_engine.check_rate_limit(rate_key)
        if not allowed:
            await self._log_attempt(
                db, attempt_id, None, request_id, channel_id, fault_id,
                False, 0, 0.0, 0.0, 0.0, "DENIED", rate_err
            )
            return {
                "attempt_id": attempt_id,
                "decision": "DENIED",
                "authorized": False,
                "failure_reason": rate_err,
                "timestamp": now.isoformat()
            }

        # 3. Validate frames count
        if not frames_base64 or len(frames_base64) < 2:
            reason = "INSUFFICIENT_TEMPORAL_FRAMES: At least 2 sequential frames required for liveness proof."
            reset_policy_engine.record_failure(rate_key)
            await self._log_attempt(
                db, attempt_id, None, request_id, channel_id, fault_id,
                False, 0, 0.0, 0.0, 0.0, "LOW_QUALITY", reason
            )
            return {
                "attempt_id": attempt_id,
                "decision": "LOW_QUALITY",
                "authorized": False,
                "failure_reason": reason,
                "timestamp": now.isoformat()
            }

        # 4. Multi-frame decoding, tracking, and evaluation
        face_crops: List[np.ndarray] = []
        quality_scores: List[float] = []
        embeddings: List[np.ndarray] = []
        multiple_faces_occurrences = 0

        for idx, frame_b64 in enumerate(frames_base64):
            img = face_detector.decode_image(frame_b64)
            if img is None:
                continue

            det = face_detector.detect_face(img)
            if det.get("error_code") == "MULTIPLE_FACES":
                multiple_faces_occurrences += 1
                if multiple_faces_occurrences >= 2:
                    reason = "Multiple distinct face tracks confirmed across frames. Only authorized operator should be visible."
                    reset_policy_engine.record_failure(rate_key)
                    await self._log_attempt(
                        db, attempt_id, None, request_id, channel_id, fault_id,
                        False, det.get("face_count", 2), 0.0, 0.0, 0.0, "MULTIPLE_FACES", reason
                    )
                    return {
                        "attempt_id": attempt_id,
                        "decision": "MULTIPLE_FACES",
                        "authorized": False,
                        "failure_reason": reason,
                        "timestamp": now.isoformat()
                    }
                continue

            if not det["face_detected"]:
                continue

            qual = face_quality_analyzer.evaluate_quality(img, det["bbox"], det["eyes"])
            if not qual["passed"]:
                continue

            face_crops.append(det["face_crop"])
            quality_scores.append(qual["quality_score"])
            embeddings.append(embedding_extractor.extract_embedding(det["face_crop"]))

        if len(face_crops) < 2:
            reason = "INSUFFICIENT_QUALIFIED_FRAMES: Could not acquire at least 2 stable verified face frames."
            reset_policy_engine.record_failure(rate_key)
            await self._log_attempt(
                db, attempt_id, None, request_id, channel_id, fault_id,
                False, 0, 0.0, 0.0, 0.0, "LOW_QUALITY", reason
            )
            return {
                "attempt_id": attempt_id,
                "decision": "LOW_QUALITY",
                "authorized": False,
                "failure_reason": reason,
                "timestamp": now.isoformat()
            }

        avg_quality = round(float(np.mean(quality_scores)), 2)

        # 5. Multi-Frame Anti-Spoofing Liveness
        liveness = anti_spoof_engine.evaluate_liveness(face_crops)
        if not liveness["liveness_passed"]:
            reason = f"Liveness check failed: {liveness['reason']}"
            reset_policy_engine.record_failure(rate_key)
            await self._log_attempt(
                db, attempt_id, None, request_id, channel_id, fault_id,
                True, 1, avg_quality, liveness["liveness_score"], 0.0, "SPOOF_DETECTED", reason
            )
            return {
                "attempt_id": attempt_id,
                "decision": "SPOOF_DETECTED",
                "authorized": False,
                "failure_reason": "LIVENESS_VERIFICATION_FAILED: Possible photo or screen spoof detected.",
                "quality_score": avg_quality,
                "liveness_score": liveness["liveness_score"],
                "timestamp": now.isoformat()
            }

        # Ensure active enrolled identities loaded
        if not enrollment_service.cached_enrolled_users:
            await enrollment_service.refresh_cache(db)

        # 6. Identity Matching across sequential frames (Median similarity aggregation)
        match = face_matcher.match_frame_sequence_against_enrolled_users(
            probe_embeddings=embeddings,
            enrolled_users=enrollment_service.cached_enrolled_users,
            max_std_deviation=0.12
        )

        sim_score = match.get("median_similarity", 0.0)

        # Check threshold
        if not match["threshold_passed"]:
            reason = f"Identity mismatch: Best median similarity {sim_score:.2f} < {match['threshold']:.2f} threshold."
            reset_policy_engine.record_failure(rate_key)
            await self._log_attempt(
                db, attempt_id, match["best_user_id"], request_id, channel_id, fault_id,
                True, 1, avg_quality, liveness["liveness_score"], sim_score, "DENIED", reason
            )
            return {
                "attempt_id": attempt_id,
                "decision": "DENIED",
                "authorized": False,
                "failure_reason": "UNAUTHORIZED_IDENTITY: Face does not match any enrolled authorized operator.",
                "similarity_score": sim_score,
                "liveness_score": liveness["liveness_score"],
                "quality_score": avg_quality,
                "timestamp": now.isoformat()
            }

        # Check frame consistency across verification window
        if not match["is_consistent"]:
            reason = f"Verification inconsistent across temporal frames (std: {match['similarity_std']:.3f} > 0.12 limit)."
            reset_policy_engine.record_failure(rate_key)
            await self._log_attempt(
                db, attempt_id, match["best_user_id"], request_id, channel_id, fault_id,
                True, 1, avg_quality, liveness["liveness_score"], sim_score, "DENIED", reason
            )
            return {
                "attempt_id": attempt_id,
                "decision": "DENIED",
                "authorized": False,
                "failure_reason": "INCONSISTENT_FRAMES: Facial evidence varied too sharply across verification window.",
                "similarity_score": sim_score,
                "liveness_score": liveness["liveness_score"],
                "quality_score": avg_quality,
                "timestamp": now.isoformat()
            }

        # 7. RBAC and Account Status Check
        rbac_ok, rbac_err = reset_policy_engine.evaluate_rbac(match["best_user_role"], match["user_status"])
        if not rbac_ok:
            reset_policy_engine.record_failure(rate_key)
            await self._log_attempt(
                db, attempt_id, match["best_user_id"], request_id, channel_id, fault_id,
                True, 1, avg_quality, liveness["liveness_score"], sim_score, "DENIED", rbac_err
            )
            return {
                "attempt_id": attempt_id,
                "decision": "DENIED",
                "authorized": False,
                "user_id": match["best_user_id"],
                "display_name": match["best_user_name"],
                "role": match["best_user_role"],
                "failure_reason": rbac_err,
                "similarity_score": sim_score,
                "liveness_score": liveness["liveness_score"],
                "quality_score": avg_quality,
                "timestamp": now.isoformat()
            }

        # 9. Clear failures on successful authorization
        reset_policy_engine.record_success(rate_key)

        channel_ids = session.get("channel_ids") or ([channel_id] if channel_id is not None else [1])

        # 10. Generate single-use reset authorization token (60s TTL)
        token, meta = reset_policy_engine.generate_reset_token(
            user_id=match["best_user_id"],
            channel_id=channel_id,
            fault_id=fault_id,
            attempt_id=attempt_id,
            channel_ids=channel_ids
        )

        # Persist authorization record in database
        auth_rec = ResetAuthorization(
            reset_request_id=request_id,
            user_id=match["best_user_id"],
            channel_id=channel_id or channel_ids[0],
            token_hash=meta["token_hash"],
            status="VALID",
            expires_at=meta["expires_at"],
            created_at=now
        )
        db.add(auth_rec)

        # Log successful attempt
        await self._log_attempt(
            db, attempt_id, match["best_user_id"], request_id, channel_id, fault_id,
            True, 1, avg_quality, liveness["liveness_score"], match["similarity_score"], "AUTHORIZED", None
        )

        # Update session status
        session["status"] = "AUTHORIZED"

        return {
            "attempt_id": attempt_id,
            "decision": "AUTHORIZED",
            "authorized": True,
            "user_id": match["best_user_id"],
            "display_name": match["best_user_name"],
            "role": match["best_user_role"],
            "similarity_score": match["similarity_score"],
            "liveness_score": liveness["liveness_score"],
            "quality_score": avg_quality,
            "channel_id": channel_id,
            "channel_ids": channel_ids,
            "fault_id": fault_id,
            "reset_authorization_token": token,
            "correlation_id": meta.get("correlation_id", f"CORR-CH[{'-'.join(str(c) for c in channel_ids)}]-{attempt_id[-6:]}"),
            "expires_in_seconds": reset_policy_engine.token_ttl_seconds,
            "timestamp": now.isoformat(),
            "message": f"Operator '{match['best_user_name']}' verified. Reset authorization token issued (60s validity)."
        }


    async def _log_attempt(
        self,
        db: AsyncSession,
        attempt_id: str,
        user_id: Optional[str],
        reset_request_id: str,
        channel_id: int,
        fault_id: str,
        face_detected: bool,
        face_count: int,
        quality: float,
        liveness: float,
        similarity: float,
        decision: str,
        failure_reason: Optional[str]
    ):
        try:
            attempt = BiometricVerificationAttempt(
                attempt_id=attempt_id,
                user_id=user_id,
                reset_request_id=reset_request_id,
                channel_id=channel_id,
                fault_id=fault_id,
                face_detected=face_detected,
                face_count=face_count,
                quality_score=quality,
                liveness_score=liveness,
                similarity_score=similarity,
                decision=decision,
                failure_reason=failure_reason,
                timestamp=datetime.datetime.utcnow()
            )
            db.add(attempt)

            # System event log
            severity = "INFO" if decision == "AUTHORIZED" else "WARNING"
            sys_event = SystemEvent(
                timestamp=datetime.datetime.utcnow(),
                event_type=f"FACE_VERIFICATION_{decision}",
                component="FACE_AUTH",
                description=f"Attempt {attempt_id} on CH{channel_id} ({fault_id}): Decision={decision}. User={user_id or 'UNKNOWN'}. Sim={similarity:.2f}, Live={liveness:.2f}, Qual={quality:.2f}. Reason={failure_reason or 'OK'}",
                severity=severity
            )
            db.add(sys_event)
            await db.commit()
        except Exception as e:
            print(f"Error recording verification attempt: {e}")

verification_service = FaceVerificationService()
