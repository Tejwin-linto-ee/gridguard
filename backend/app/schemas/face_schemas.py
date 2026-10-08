from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime

# Verification Session Start
class VerificationStartRequest(BaseModel):
    channel_id: Optional[int] = Field(None, ge=1, le=4)
    channel_ids: Optional[List[int]] = None
    action_type: Optional[str] = "RESET" # "RESET" or "TRIP" or "MAINTENANCE_TRIP"
    fault_id: Optional[str] = "FLT-CURRENT-LATCHED"
    requested_by: Optional[str] = "Lead Operator"

class VerificationStartResponse(BaseModel):
    request_id: str
    channel_id: Optional[int] = None
    channel_ids: Optional[List[int]] = None
    action_type: Optional[str] = "RESET"
    fault_id: str
    session_nonce: str
    created_at: str
    expires_at: str

# Frame-by-frame live feedback for camera HUD
class VerificationFrameRequest(BaseModel):
    frame_base64: str

class VerificationFrameResponse(BaseModel):
    face_detected: bool
    face_count: int
    bbox: Optional[Tuple[int, int, int, int]] = None
    quality_score: float
    category: str
    guidance: str
    liveness_hint: str
    raw_detections: Optional[int] = 0
    post_nms_detections: Optional[int] = 0
    post_duplicate_detections: Optional[int] = 0
    stable_tracks_count: Optional[int] = 0
    tracking_stability: Optional[float] = 0.0
    detector_name: Optional[str] = "OpenCV-Haar-v4.14.0-NMS-Tracked"
    embedding_model_name: Optional[str] = "facenet512-sp-v1.2"
    liveness_model_name: Optional[str] = "Heuristic Multi-Frame Anti-Spoofing (Temporal MAD Dynamics)"

# Verification Completion
class VerificationCompleteRequest(BaseModel):
    request_id: str
    frames_base64: List[str]
    client_session_id: Optional[str] = "web-client-session"

class VerificationCompleteResponse(BaseModel):
    attempt_id: str
    decision: str # AUTHORIZED, DENIED, SPOOF_DETECTED, LOW_QUALITY, NO_FACE, MULTIPLE_FACES, TIMEOUT
    authorized: bool
    user_id: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[str] = None
    similarity_score: float = 0.0
    liveness_score: float = 0.0
    quality_score: float = 0.0
    channel_id: Optional[int] = None
    channel_ids: Optional[List[int]] = None
    fault_id: Optional[str] = None
    reset_authorization_token: Optional[str] = None
    correlation_id: Optional[str] = None
    expires_in_seconds: Optional[int] = None
    timestamp: str
    message: Optional[str] = None
    failure_reason: Optional[str] = None

# Threshold Management Schemas
class ThresholdUpdateRequest(BaseModel):
    threshold: float = Field(..., ge=0.65, le=0.95)
    reason: str = Field(..., min_length=5)

class ThresholdResponse(BaseModel):
    current_threshold: float
    threshold_version: str
    status: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None

# Forensic Timeline & Observability Schemas
class ForensicTimelineStep(BaseModel):
    step_name: str
    timestamp: str
    status: str
    details: Dict[str, Any]

class ForensicTimelineResponse(BaseModel):
    correlation_id: str
    channel_id: Optional[int] = None
    operator_id: Optional[str] = None
    final_status: str
    timeline: List[ForensicTimelineStep]

class BiometricMetricsResponse(BaseModel):
    total_attempts: int
    success_count: int
    denial_count: int
    spoof_count: int
    lockout_count: int
    mean_latency_ms: float
    p95_latency_ms: float
    active_operators_count: int
    current_threshold: float
    threshold_version: str

# Enrollment Schemas

class EnrollmentStartRequest(BaseModel):
    user_id: str = Field(..., min_length=3, max_length=50)
    display_name: str = Field(..., min_length=2, max_length=100)
    role: str = Field("OPERATOR", pattern="^(ADMIN|OPERATOR)$")

class EnrollmentSessionStartResponse(BaseModel):
    session_id: str
    user_id: str
    display_name: str
    role: str
    current_step: int = 1
    step_target: str
    instructions: str
    min_frames_required: int = 10
    total_steps: int = 5

class EnrollmentVerifyRequest(BaseModel):
    user_id: str
    display_name: str
    role: str = "OPERATOR"
    frames_base64: List[str]
    session_id: Optional[str] = None

class EnrollmentSampleValidateRequest(BaseModel):
    frame_base64: Optional[str] = None
    frames_base64: Optional[List[str]] = None
    sample_step: int = 1
    session_id: Optional[str] = None

class EnrollmentSampleValidateResponse(BaseModel):
    accepted: bool
    reason: str
    guidance: str
    quality_score: float
    category: Optional[str] = "GOOD"
    face_detected: bool
    single_face: bool
    pose: Optional[Dict[str, Any]] = None
    metrics: Optional[Dict[str, Any]] = None
    step_target: Optional[str] = None
    # Diagnostic fields for telemetry (no raw embeddings)
    blur_score: Optional[float] = 0.0
    luminance_score: Optional[float] = 0.0
    contrast_score: Optional[float] = 0.0
    centering_score: Optional[float] = 0.0
    liveness_pass: Optional[bool] = False
    liveness_method: Optional[str] = "HEURISTIC_MULTI_FRAME_TEMPORAL"
    liveness_scores: Optional[Dict[str, Any]] = None
    liveness_thresholds: Optional[Dict[str, Any]] = None
    rejection_reason: Optional[str] = None
    lighting_condition: Optional[str] = "OPTIMAL"
    collected_frames_count: Optional[int] = 0
    ready_to_capture: Optional[bool] = False
    raw_detections: Optional[int] = 0
    post_nms_detections: Optional[int] = 0
    post_duplicate_detections: Optional[int] = 0
    stable_tracks_count: Optional[int] = 0
    tracking_stability: Optional[float] = 0.0
    detector_name: Optional[str] = "OpenCV-Haar-v4.14.0-NMS-Tracked"
    embedding_model_name: Optional[str] = "facenet512-sp-v1.2"
    liveness_model_name: Optional[str] = "Heuristic Multi-Frame Anti-Spoofing (Temporal MAD Dynamics)"

class EnrollmentResponse(BaseModel):
    success: bool
    user_id: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = "ACTIVE"
    enrollment_version: Optional[int] = None
    sample_count: Optional[int] = None
    average_quality: Optional[float] = None
    consistency_score: Optional[float] = None
    enrollment_quality: Optional[str] = None
    model_version: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None

class AntiSpoofEvaluateRequest(BaseModel):
    frames_base64: List[str]
    claimed_type: str = "REAL_FACE" # REAL_FACE, PHOTO, PHONE_SCREEN, REPLAY_VIDEO

class AntiSpoofEvaluateResponse(BaseModel):
    claimed_type: str
    expected_pass: bool
    actual_pass: bool
    test_success: bool
    liveness_score: float
    detected_attack: str
    details: Dict[str, Any]


# Reset Execution & Safety Validation
class ChannelSafetyEvaluation(BaseModel):
    channel_id: int
    safety_passed: bool
    status: str
    message: str

class ResetAuthorizeRequest(BaseModel):
    reset_authorization_token: str
    channel_id: Optional[int] = None
    channel_ids: Optional[List[int]] = None
    fault_id: Optional[str] = None

class ResetAuthorizeResponse(BaseModel):
    authorized: bool
    safety_passed: bool
    channel_id: Optional[int] = None
    channel_ids: Optional[List[int]] = None
    channel_evaluations: Optional[List[ChannelSafetyEvaluation]] = None
    fault_id: Optional[str] = None
    status: str # SAFETY_CHECK_PASSED, SAFETY_CHECK_FAILED, TOKEN_INVALID, PARTIALLY_PASSED
    message: str

class ChannelResetResult(BaseModel):
    channel_id: int
    success: bool
    status: str
    message: str
    relay_action_taken: str
    restored_status: str

class ResetExecuteRequest(BaseModel):
    reset_authorization_token: str
    channel_id: Optional[int] = Field(None, ge=1, le=4)
    channel_ids: Optional[List[int]] = None

class ResetExecuteResponse(BaseModel):
    success: bool
    channel_id: Optional[int] = None
    channel_ids: Optional[List[int]] = None
    results: Optional[List[ChannelResetResult]] = None
    message: str
    relay_action_taken: str
    restored_status: str

# Maintenance Trip Schemas (Multi-Channel De-energization)
class ChannelTripEvaluation(BaseModel):
    channel_id: int
    eligible_for_trip: bool
    status: str
    message: str

class TripAuthorizeRequest(BaseModel):
    authorization_token: str
    channel_id: Optional[int] = None
    channel_ids: Optional[List[int]] = None
    reason: Optional[str] = "SCHEDULED_MAINTENANCE"

class TripAuthorizeResponse(BaseModel):
    authorized: bool
    trip_permitted: bool
    channel_id: Optional[int] = None
    channel_ids: Optional[List[int]] = None
    channel_evaluations: Optional[List[ChannelTripEvaluation]] = None
    status: str # PERMITTED, BLOCKED, PARTIALLY_PERMITTED
    message: str

class ChannelTripResult(BaseModel):
    channel_id: int
    success: bool
    status: str # MAINTENANCE, FAILED, BLOCKED
    message: str
    relay_action_taken: str # MAIN_AND_AUX_RELAYS_OPENED, NONE
    resulting_status: str # MAINTENANCE, FAULT LATCHED, OFFLINE

class TripExecuteRequest(BaseModel):
    authorization_token: str
    channel_id: Optional[int] = Field(None, ge=1, le=4)
    channel_ids: Optional[List[int]] = None
    reason: Optional[str] = "SCHEDULED_MAINTENANCE"

class TripExecuteResponse(BaseModel):
    success: bool
    channel_id: Optional[int] = None
    channel_ids: Optional[List[int]] = None
    results: Optional[List[ChannelTripResult]] = None
    message: str
    relay_action_taken: str
    resulting_status: str

# User Management & Audit Schemas
class BiometricUserSchema(BaseModel):
    user_id: str
    display_name: str
    role: str
    status: str
    enrollment_version: int
    embedding_version: str
    created_at: datetime
    last_verified_at: Optional[datetime] = None

class BiometricAuditSchema(BaseModel):
    attempt_id: str
    user_id: Optional[str]
    channel_id: Optional[int]
    fault_id: Optional[str]
    face_detected: bool
    quality_score: float
    liveness_score: float
    similarity_score: float
    decision: str
    failure_reason: Optional[str]
    timestamp: datetime

class ThresholdResponse(BaseModel):
    current_threshold: float
    threshold_version: str
    status: str
    message: Optional[str] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None

class ThresholdUpdateRequest(BaseModel):
    threshold: float = Field(..., ge=0.50, le=0.98)
    reason: Optional[str] = "Routine threshold calibration"
    version: Optional[str] = "calibrated-v1.3"

class ForensicTimelineStep(BaseModel):
    step_name: str
    timestamp: str
    status: str
    details: Optional[Dict[str, Any]] = None

class ForensicTimelineResponse(BaseModel):
    correlation_id: str
    final_status: str
    timeline: List[ForensicTimelineStep]

class BiometricMetricsResponse(BaseModel):
    total_attempts: int
    success_count: int
    denial_count: int
    spoof_count: int
    lockout_count: int
    mean_latency_ms: float
    p95_latency_ms: float
    active_operators_count: int
    current_threshold: float
    threshold_version: str

# Admin User & Operator Management Schemas
class UserCreateRequest(BaseModel):
    user_id: str = Field(..., min_length=2, max_length=50)
    display_name: str = Field(..., min_length=2, max_length=100)
    role: str = Field(default="OPERATOR", pattern="^(ADMIN|OPERATOR)$")

class UserUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(None, min_length=2, max_length=100)
    role: Optional[str] = Field(None, pattern="^(ADMIN|OPERATOR)$")
    status: Optional[str] = Field(None, pattern="^(ACTIVE|DISABLED|REVOKED)$")

class BiometricUserDetailSchema(BaseModel):
    id: int
    user_id: str
    display_name: str
    role: str
    status: str
    biometric_status: str # ENROLLED, NOT_ENROLLED, RE_ENROLLMENT_PENDING, DISABLED
    enrollment_version: int
    embedding_version: str
    model_name: str
    model_version: str
    sample_count: int
    average_quality_score: float
    created_at: datetime
    updated_at: datetime
    enrolled_at: Optional[datetime] = None
    last_verified_at: Optional[datetime] = None
    verification_count: int = 0
    failed_attempts: int = 0



