import numpy as np
from typing import List, Dict, Any, Optional

class FaceMatcher:
    """
    Biometric Face Vector Matching Engine (Sections 15 & 16).
    Uses cosine similarity on 512-dimensional normalized embeddings.
    Strictly separates:
    - Face Similarity Score
    - Liveness Score
    - Quality Score
    - Final Security Decision
    """
    def __init__(self, verification_threshold: float = 0.78):
        # Verification threshold calibrated for FAR < 0.1%
        self.verification_threshold = verification_threshold
        self.threshold_version = "v1.2-far01"

    def compute_similarity(self, vector_a: np.ndarray, vector_b: np.ndarray) -> float:
        """
        Computes cosine similarity between two 512-D vectors:
        Cosine Similarity = dot(a, b) / (||a|| * ||b||)
        Returns score bounded in [0.0, 1.0].
        """
        if vector_a is None or vector_b is None:
            return 0.0
        norm_a = np.linalg.norm(vector_a)
        norm_b = np.linalg.norm(vector_b)
        if norm_a < 1e-6 or norm_b < 1e-6:
            return 0.0

        dot_product = float(np.dot(vector_a, vector_b))
        cosine_sim = dot_product / (norm_a * norm_b)
        # Rescale [-1, 1] to [0, 1]
        similarity = float(np.clip((cosine_sim + 1.0) / 2.0, 0.0, 1.0))
        return round(similarity, 4)

    def match_against_enrolled_users(
        self,
        probe_embedding: np.ndarray,
        enrolled_users: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Compares probe vector against all enrolled authorized biometric identities.
        """
        if not enrolled_users or probe_embedding is None:
            return {
                "matched": False,
                "best_user_id": None,
                "best_user_name": None,
                "best_user_role": None,
                "similarity_score": 0.0,
                "threshold": self.verification_threshold,
                "status": "NO_ENROLLED_IDENTITIES"
            }

        best_similarity = 0.0
        best_user = None

        for user in enrolled_users:
            ref_vector = user.get("embedding_vector")
            if ref_vector is None:
                continue

            sim = self.compute_similarity(probe_embedding, ref_vector)
            if sim > best_similarity:
                best_similarity = sim
                best_user = user

        effective_threshold = self.verification_threshold
        effective_version = self.threshold_version

        is_match = best_similarity >= effective_threshold

        return {
            "matched": is_match,
            "best_user_id": best_user.get("user_id") if best_user else None,
            "best_user_name": best_user.get("display_name") if best_user else None,
            "best_user_role": best_user.get("role") if best_user else None,
            "user_status": best_user.get("status") if best_user else None,
            "similarity_score": best_similarity,
            "threshold": effective_threshold,
            "threshold_version": effective_version,
            "status": "MATCHED" if is_match else "SIMILARITY_BELOW_THRESHOLD"
        }

    def match_frame_sequence_against_enrolled_users(
        self,
        probe_embeddings: List[np.ndarray],
        enrolled_users: List[Dict[str, Any]],
        max_std_deviation: float = 0.12
    ) -> Dict[str, Any]:
        """
        Multi-frame verification with robust median similarity aggregation (Requirements 19 & 20).
        Protects against 'one lucky frame' authorizations.
        Requires identity evidence to be consistent across the verification window.
        """
        if not enrolled_users or not probe_embeddings:
            return {
                "matched": False,
                "best_user_id": None,
                "best_user_name": None,
                "best_user_role": None,
                "user_status": None,
                "median_similarity": 0.0,
                "mean_similarity": 0.0,
                "similarity_std": 0.0,
                "frame_similarities": [],
                "is_consistent": False,
                "threshold": self.verification_threshold,
                "status": "NO_ENROLLED_IDENTITIES"
            }

        best_user = None
        best_median = -1.0
        best_details = {}

        for user in enrolled_users:
            ref_vector = user.get("embedding_vector")
            if ref_vector is None:
                continue

            frame_sims = [self.compute_similarity(emb, ref_vector) for emb in probe_embeddings]
            med_sim = round(float(np.median(frame_sims)), 4)
            mean_sim = round(float(np.mean(frame_sims)), 4)
            std_sim = round(float(np.std(frame_sims)), 4)

            if med_sim > best_median:
                best_median = med_sim
                best_user = user
                best_details = {
                    "median_similarity": med_sim,
                    "mean_similarity": mean_sim,
                    "similarity_std": std_sim,
                    "frame_similarities": frame_sims,
                    "is_consistent": std_sim <= max_std_deviation
                }

        effective_threshold = self.verification_threshold
        is_threshold_passed = best_median >= effective_threshold
        is_consistent = best_details.get("is_consistent", True)
        is_match = is_threshold_passed and is_consistent

        return {
            "matched": is_match,
            "threshold_passed": is_threshold_passed,
            "best_user_id": best_user.get("user_id") if best_user else None,
            "best_user_name": best_user.get("display_name") if best_user else None,
            "best_user_role": best_user.get("role") if best_user else None,
            "user_status": best_user.get("status") if best_user else None,
            "similarity_score": best_median, # Reporting robust median similarity
            "median_similarity": best_median,
            "mean_similarity": best_details.get("mean_similarity", 0.0),
            "similarity_std": best_details.get("similarity_std", 0.0),
            "frame_similarities": best_details.get("frame_similarities", []),
            "is_consistent": is_consistent,
            "threshold": effective_threshold,
            "threshold_version": self.threshold_version,
            "status": "MATCHED" if is_match else ("INCONSISTENT_FRAMES" if is_threshold_passed and not is_consistent else "SIMILARITY_BELOW_THRESHOLD")
        }


    def set_threshold(self, threshold: float, version: str):
        """Sets operating threshold and version."""
        self.verification_threshold = threshold
        self.threshold_version = version

face_matcher = FaceMatcher()

