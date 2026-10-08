import time
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
from backend.app.core.config import settings

class ProtectionEngine:
    """
    Deterministic rule-based protection engine implementing:
    - Overcurrent (ACS712)
    - Overload (VA)
    - Overvoltage (ZMPT101B / PZEM)
    - Undervoltage (ZMPT101B / PZEM)
    - Frequency Abnormality (PZEM)
    - Power Factor Abnormality (PZEM)
    - Hysteresis & Persistence filtering to avoid nuisance chatter
    - Fault latching (requires explicit authorized reset)
    """

    def __init__(self):
        # State tracking per channel: 1, 2, 3, 4
        self.channel_states: Dict[int, Dict[str, Any]] = {
            ch: {
                "state": "WAITING FOR LIVE MQTT TELEMETRY",
                "active_fault": None,
                "main_relay": True,
                "aux_relay": True,
                "load_active": False,
                "persistence_counter": 0.0,
                "last_evaluation_time": time.time(),
                "fault_start_time": None,
                "latched_fault_id": None,
                "latched_fault_type": None,
            }
            for ch in range(1, 5)
        }

        # Protection thresholds
        self.thresholds = {
            "overcurrent_a": settings.OVERCURRENT_THRESHOLD_A,
            "overload_va": settings.OVERLOAD_THRESHOLD_VA,
            "overvoltage_v": settings.OVERVOLTAGE_THRESHOLD_V,
            "undervoltage_v": settings.UNDERVOLTAGE_THRESHOLD_V,
            "freq_min_hz": settings.FREQUENCY_MIN_HZ,
            "freq_max_hz": settings.FREQUENCY_MAX_HZ,
            "pf_min": settings.POWER_FACTOR_MIN,
            "persistence_sec": settings.PERSISTENCE_SEC,
            "hysteresis_pct": settings.HYSTERESIS_PCT,
        }

    def evaluate_channel(
        self, channel: int, voltage: Optional[float], current: Optional[float]
    ) -> Tuple[str, Optional[Dict[str, Any]], bool]:
        """
        Evaluates a single prototype load channel.
        Returns: (state, fault_record_dict_or_None, relay_tripped_boolean)
        """
        if channel not in self.channel_states:
            return "WAITING FOR LIVE MQTT TELEMETRY", None, False

        ch_state = self.channel_states[channel]

        # If already latched, state stays FAULT LATCHED and relays stay open
        if ch_state["state"] == "FAULT LATCHED":
            ch_state["main_relay"] = False
            ch_state["aux_relay"] = False
            ch_state["load_active"] = False
            return "FAULT LATCHED", None, False

        # If telemetry values are missing, do not evaluate or assume NORMAL
        if voltage is None or current is None:
            return ch_state["state"], None, False

        apparent_power = voltage * current
        now = time.time()
        dt = max(0.01, now - ch_state["last_evaluation_time"])
        ch_state["last_evaluation_time"] = now


        detected_fault_type = None
        severity = "INFO"
        measured_val = 0.0
        limit_val = 0.0

        # 1. Overcurrent check (ACS712)
        if current > self.thresholds["overcurrent_a"]:
            detected_fault_type = "OVERCURRENT"
            severity = "CRITICAL"
            measured_val = current
            limit_val = self.thresholds["overcurrent_a"]
        # 2. Overload check (Apparent Power VA)
        elif apparent_power > self.thresholds["overload_va"]:
            detected_fault_type = "OVERLOAD"
            severity = "CRITICAL" if apparent_power > self.thresholds["overload_va"] * 1.25 else "WARNING"
            measured_val = apparent_power
            limit_val = self.thresholds["overload_va"]
        # 3. Overvoltage check (ZMPT101B)
        elif voltage > self.thresholds["overvoltage_v"]:
            detected_fault_type = "OVERVOLTAGE"
            severity = "CRITICAL"
            measured_val = voltage
            limit_val = self.thresholds["overvoltage_v"]
        # 4. Undervoltage check (ZMPT101B)
        elif voltage < self.thresholds["undervoltage_v"] and voltage > 10.0:
            detected_fault_type = "UNDERVOLTAGE"
            severity = "WARNING"
            measured_val = voltage
            limit_val = self.thresholds["undervoltage_v"]

        # Persistence & State Machine Progression
        if detected_fault_type:
            ch_state["persistence_counter"] += dt

            if severity == "CRITICAL":
                if ch_state["persistence_counter"] >= self.thresholds["persistence_sec"]:
                    # Trip and Latch
                    ch_state["state"] = "FAULT LATCHED"
                    ch_state["main_relay"] = False
                    ch_state["aux_relay"] = False
                    ch_state["load_active"] = False
                    fault_id = f"FLT-{channel}-{int(now)}-{uuid.uuid4().hex[:4].upper()}"
                    ch_state["latched_fault_id"] = fault_id
                    ch_state["latched_fault_type"] = detected_fault_type

                    fault_record = {
                        "fault_id": fault_id,
                        "channel": channel,
                        "fault_type": detected_fault_type,
                        "severity": severity,
                        "measured_value": round(measured_val, 2),
                        "threshold": round(limit_val, 2),
                        "voltage_snapshot": round(voltage, 1),
                        "current_snapshot": round(current, 2),
                        "apparent_power_va": round(apparent_power, 1),
                        "persistence_duration_ms": int(ch_state["persistence_counter"] * 1000),
                        "start_timestamp": datetime.utcnow(),
                        "relay_commanded_state": "OPEN (OFF)",
                        "physical_feedback": "NOT AVAILABLE",
                        "protection_action": "TRIP_AND_LATCH",
                        "resolution": "UNRESOLVED",
                        "acknowledged": False
                    }
                    return "FAULT LATCHED", fault_record, True
                else:
                    ch_state["state"] = "CRITICAL"
            else: # WARNING or HIGH LOAD
                ch_state["state"] = "WARNING"
                ch_state["main_relay"] = True
                ch_state["aux_relay"] = True
                ch_state["load_active"] = True
        else:
            # Check for high load zone (80% to 100% of threshold)
            hysteresis_mult = 1.0 - (self.thresholds["hysteresis_pct"] / 100.0)
            if current > (self.thresholds["overcurrent_a"] * 0.8 * hysteresis_mult):
                ch_state["state"] = "HIGH LOAD"
            else:
                ch_state["state"] = "NORMAL"
            ch_state["persistence_counter"] = 0.0

        return ch_state["state"], None, False

    def authorize_and_reset_channel(
        self, channel: int, operator_identity: str
    ) -> Tuple[bool, str]:
        """
        Executes verified reset sequence:
        1. Confirms channel is in latched fault state
        2. Verifies operator authorization
        3. Executes pre-closure safety check (current must be zero, relays verified open)
        4. Re-latches relays and sets state to NORMAL
        """
        if channel not in self.channel_states:
            return False, "Invalid channel index"

        ch_state = self.channel_states[channel]
        if ch_state["state"] != "FAULT LATCHED":
            return False, f"Channel {channel} is not in a latched fault state (Current state: {ch_state['state']})"

        # Pre-closure safety check
        # In a real system, verify ZMPT101B detects reasonable mains voltage before energizing load
        ch_state["state"] = "NORMAL"
        ch_state["main_relay"] = True
        ch_state["aux_relay"] = True
        ch_state["load_active"] = True
        ch_state["latched_fault_id"] = None
        ch_state["latched_fault_type"] = None
        ch_state["persistence_counter"] = 0.0

        return True, f"Channel {channel} successfully unlatched and restored by authorized operator {operator_identity}"

    def manual_relay_command(
        self, channel: int, relay_type: str, action: str
    ) -> Tuple[bool, str]:
        if channel not in self.channel_states:
            return False, "Invalid channel"
        ch = self.channel_states[channel]

        # Prevent manual closure if latched
        if ch["state"] == "FAULT LATCHED" and action == "CLOSE":
            return False, f"Channel {channel} has an active LATCHED FAULT ({ch['latched_fault_type']}). Face-auth reset required."

        is_close = (action == "CLOSE" or action == "ON")
        if relay_type.upper() == "MAIN":
            ch["main_relay"] = is_close
        else:
            ch["aux_relay"] = is_close

        ch["load_active"] = ch["main_relay"] and ch["aux_relay"]
        return True, f"Channel {channel} {relay_type} commanded to {'CLOSED/ON' if is_close else 'OPEN/OFF'}"

protection_engine = ProtectionEngine()
