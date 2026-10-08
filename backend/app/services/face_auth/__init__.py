"""
GRIDGUARD Face Authentication & Authorized Reset Subsystem.
Implements production-grade in-website biometric face detection, quality inspection,
multi-frame anti-spoofing liveness verification, 512-dim embedding extraction,
and fail-closed safety reset authorization.
"""

from .detector import face_detector
from .quality import face_quality_analyzer
from .liveness import anti_spoof_engine
from .embedding import embedding_extractor
from .matcher import face_matcher
from .policy import reset_policy_engine
from .verification import verification_service
from .enrollment import enrollment_service

__all__ = [
    "face_detector",
    "face_quality_analyzer",
    "anti_spoof_engine",
    "embedding_extractor",
    "face_matcher",
    "reset_policy_engine",
    "verification_service",
    "enrollment_service",
]
