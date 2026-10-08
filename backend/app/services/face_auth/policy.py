import secrets
import hashlib
import hmac
import asyncio
import datetime
from typing import Dict, Any, Optional, Tuple

class ResetPolicyEngine:
    """
    Authorization Policy, Token Lifecycle, Safety Validation, and Rate Limiting (Sections 18-25).
    Enforces fail-closed security invariants:
    - Role-Based Access Control (RBAC)
    - Single-use cryptographically random reset tokens (60s TTL)
    - Anti-replay, race condition prevention, and rate limiting lockout
    - Electrical safety validation prior to relay closure
    """
    def __init__(self, token_ttl_seconds: int = 60, max_failed_attempts: int = 5, cooldown_seconds: int = 300):
        self.token_ttl_seconds = token_ttl_seconds
        self.max_failed_attempts = max_failed_attempts
        self.cooldown_seconds = cooldown_seconds

        # In-memory rate limiting tracker: {key: (fail_count, lockout_until_datetime)}
        self.failure_tracker: Dict[str, Tuple[int, Optional[datetime.datetime]]] = {}

        # Active issued tokens: {token_hash: token_metadata}
        self.issued_tokens: Dict[str, Dict[str, Any]] = {}

        # Concurrency lock to guarantee atomic token consumption (Section 24)
        self.token_lock = asyncio.Lock()

        # Configurable operating threshold & versioning (Section 6)
        self.verification_threshold = 0.780
        self.threshold_version = "v1.3-calibrated"

    def hash_token(self, token: str) -> str:
        """Computes SHA-256 hash of token to prevent plaintext storage in database."""
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def update_threshold(
        self,
        new_threshold: float,
        admin_username: str,
        reason: str
    ) -> Dict[str, Any]:
        """
        ADMIN-controlled threshold update with versioning & audit logging (Section 6).
        Clamps value between 0.650 and 0.950.
        """
        old_threshold = self.verification_threshold
        clamped = round(float(max(0.650, min(0.950, new_threshold))), 3)
        self.verification_threshold = clamped

        # Bump threshold version
        ver_num = int(self.threshold_version.split("-")[0].replace("v", "").replace(".", "")) + 1
        self.threshold_version = f"v{ver_num // 10}.{ver_num % 10}-calibrated"

        return {
            "success": True,
            "old_threshold": old_threshold,
            "new_threshold": clamped,
            "threshold_version": self.threshold_version,
            "updated_by": admin_username,
            "reason": reason,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }

    def check_rate_limit(self, identifier: str) -> Tuple[bool, Optional[str]]:
        """
        Enforces maximum failed attempt policy (Section 24).
        Returns (allowed, error_message).
        """
        now = datetime.datetime.utcnow()
        if identifier in self.failure_tracker:
            count, lockout_until = self.failure_tracker[identifier]
            if lockout_until and now < lockout_until:
                remaining_sec = int((lockout_until - now).total_seconds())
                return False, f"TOO_MANY_FAILED_ATTEMPTS: Security lockout active. Try again in {remaining_sec}s."
            elif lockout_until and now >= lockout_until:
                # Cooldown expired, reset tracker
                self.failure_tracker[identifier] = (0, None)
        return True, None

    def record_failure(self, identifier: str) -> bool:
        """
        Increments failed attempt count. Enforces lockout if limit reached.
        Returns True if newly locked out.
        """
        now = datetime.datetime.utcnow()
        count, lockout = self.failure_tracker.get(identifier, (0, None))
        new_count = count + 1
        if new_count >= self.max_failed_attempts:
            lockout_until = now + datetime.timedelta(seconds=self.cooldown_seconds)
            self.failure_tracker[identifier] = (new_count, lockout_until)
            return True
        else:
            self.failure_tracker[identifier] = (new_count, None)
            return False

    def record_success(self, identifier: str):
        """Clears failure counter upon successful authorization."""
        if identifier in self.failure_tracker:
            del self.failure_tracker[identifier]

    def evaluate_rbac(self, user_role: str, user_status: str) -> Tuple[bool, Optional[str]]:
        """
        Validates user privileges (Section 38).
        Only ADMIN and OPERATOR roles may reset protection relays.
        Account must be ACTIVE.
        """
        if user_status != "ACTIVE":
            return False, "ACCOUNT_DISABLED: Biometric identity matched but user account is disabled or revoked."

        if user_role not in ["ADMIN", "OPERATOR"]:
            return False, f"INSUFFICIENT_ROLE: Role '{user_role}' is not authorized to reset protection relays."

        return True, None

    def generate_reset_token(
        self,
        user_id: str,
        channel_id: Optional[int] = None,
        fault_id: str = "FLT-CURRENT-LATCHED",
        attempt_id: str = "",
        channel_ids: Optional[list] = None
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Generates a cryptographically random, short-lived, one-time reset token (Section 20).
        Binds correlation_id across all operations and supports multiple channel_ids.
        """
        token = secrets.token_urlsafe(32)
        token_hash = self.hash_token(token)
        now = datetime.datetime.utcnow()
        expires_at = now + datetime.timedelta(seconds=self.token_ttl_seconds)
        
        # Consolidate channel list
        channels = list(channel_ids) if channel_ids else ([channel_id] if channel_id is not None else [1])
        channels_str = "-".join(str(c) for c in sorted(channels))
        correlation_id = f"CORR-CH[{channels_str}]-{secrets.token_hex(4).upper()}"

        metadata = {
            "token_hash": token_hash,
            "user_id": user_id,
            "channel_id": channels[0] if len(channels) == 1 else None,
            "channel_ids": sorted(channels),
            "fault_id": fault_id,
            "attempt_id": attempt_id,
            "correlation_id": correlation_id,
            "created_at": now,
            "expires_at": expires_at,
            "used": False
        }

        self.issued_tokens[token_hash] = metadata
        return token, metadata

    async def validate_and_consume_token_async(
        self,
        token: str,
        channel_id: Optional[int] = None,
        fault_id: Optional[str] = None,
        channel_ids: Optional[list] = None
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        """
        Atomically validates one-time reset token and burns it under concurrency lock (anti-replay & double-spend prevention).
        Uses constant-time comparison (hmac.compare_digest).
        Validates that requested channel(s) are strictly within the token's authorized scope.
        """
        token_hash = self.hash_token(token)

        async with self.token_lock:
            # Constant-time token lookup
            matched_hash = None
            for stored_hash in list(self.issued_tokens.keys()):
                if hmac.compare_digest(token_hash, stored_hash):
                    matched_hash = stored_hash
                    break

            if not matched_hash:
                return False, "INVALID_TOKEN: Authorization token does not exist or was already consumed.", None

            meta = self.issued_tokens[matched_hash]
            now = datetime.datetime.utcnow()

            if meta["used"]:
                return False, "TOKEN_ALREADY_USED: Token has already been consumed (replay attack rejected).", None

            if now > meta["expires_at"]:
                del self.issued_tokens[matched_hash]
                return False, "TOKEN_EXPIRED: Reset authorization window expired (60s limit). Re-verification required.", None

            # Determine authorized channels
            authorized_channels = set(meta.get("channel_ids") or ([meta["channel_id"]] if meta.get("channel_id") else []))
            requested_channels = set(channel_ids if channel_ids else ([channel_id] if channel_id is not None else []))

            # Strict exact-set binding: authorized set must match requested set exactly
            if requested_channels != authorized_channels:
                return False, f"CHANNEL_MISMATCH: Token was authorized strictly for Channel(s) {sorted(list(authorized_channels))}, but requested {sorted(list(requested_channels))}. Re-authentication required for different channel sets.", None

            # Atomically burn token
            meta["used"] = True
            meta["used_at"] = now
            consumed_meta = dict(meta)
            del self.issued_tokens[matched_hash]

            return True, None, consumed_meta

    def validate_and_consume_token(
        self,
        token: str,
        channel_id: Optional[int] = None,
        fault_id: Optional[str] = None,
        channel_ids: Optional[list] = None
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        """Synchronous wrapper for backward compatibility."""
        token_hash = self.hash_token(token)
        matched_hash = None
        for stored_hash in list(self.issued_tokens.keys()):
            if hmac.compare_digest(token_hash, stored_hash):
                matched_hash = stored_hash
                break

        if not matched_hash:
            return False, "INVALID_TOKEN: Authorization token does not exist or was already consumed.", None

        meta = self.issued_tokens[matched_hash]
        now = datetime.datetime.utcnow()

        if meta["used"]:
            return False, "TOKEN_ALREADY_USED: Token has already been consumed (replay attack rejected).", None

        if now > meta["expires_at"]:
            del self.issued_tokens[matched_hash]
            return False, "TOKEN_EXPIRED: Reset authorization window expired (60s limit). Re-verification required.", None

        authorized_channels = set(meta.get("channel_ids") or ([meta["channel_id"]] if meta.get("channel_id") else []))
        requested_channels = set(channel_ids if channel_ids else ([channel_id] if channel_id is not None else []))

        # Strict exact-set binding: authorized set must match requested set exactly
        if requested_channels != authorized_channels:
            return False, f"CHANNEL_MISMATCH: Token was authorized strictly for Channel(s) {sorted(list(authorized_channels))}, but requested {sorted(list(requested_channels))}. Re-authentication required for different channel sets.", None

        meta["used"] = True
        meta["used_at"] = now
        consumed_meta = dict(meta)
        del self.issued_tokens[matched_hash]

        return True, None, consumed_meta


    def validate_channel_safety(
        self,
        channel_state: Dict[str, Any]
    ) -> Tuple[bool, Optional[str]]:
        """
        Pre-closure electrical safety validation (Section 22 & 54).
        Guarantees face recognition cannot become an unsafe bypass.
        """
        if not channel_state:
            return False, "SAFETY_CHECK_FAILED: Channel telemetry unavailable."

        v = channel_state.get("voltage")
        i = channel_state.get("current")

        # Voltage check: If voltage is actively present, ensure 180V <= V <= 260V.
        if v is not None and v > 0.0 and (v < 180.0 or v > 260.0):
            return False, f"SAFETY_CHECK_FAILED: Line voltage ({v}V) is outside nominal safety boundary (180V - 260V)."

        # Active Power check: If active power is actively measured above 12.0 W, reject reset!
        p = channel_state.get("active_power")
        if p is not None and p > 12.0:
            return False, f"SAFETY_CHECK_FAILED: Active power ({p}W) exceeds maximum safe reset ceiling (> 12.0W)."

        # Current condition check: If current is actively measured above critical threshold (2.50A), do NOT close!
        if i is not None and i > 2.50:
            return False, f"SAFETY_CHECK_FAILED: Protection condition remains active (Current: {i}A > 2.50A limit)."

        return True, "SAFETY_CHECK_PASSED"

reset_policy_engine = ResetPolicyEngine()
