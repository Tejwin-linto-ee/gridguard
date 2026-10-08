"""
GRIDGUARD Hardware Commissioning Service
Manages the authoritative 20-step hardware commissioning workflow:
Transitioning from:
  SOFTWARE_ONLY / SIMULATOR -> REAL_HARDWARE -> HARDWARE_VALIDATION_PENDING -> HARDWARE_VALIDATED
Strict Invariant:
  REAL_HARDWARE does NOT automatically mean HARDWARE_VALIDATED.
  SIMULATOR VALIDATION DOES NOT CONSTITUTE PHYSICAL HARDWARE VALIDATION.
"""

import datetime
from typing import Dict, Any, List, Optional

COMMISSIONING_STEPS = [
    {"step": 1, "name": "ESP32 Detected", "type": "AUTOMATED", "description": "Verify MCU identity and initial registration."},
    {"step": 2, "name": "Wi-Fi Connection", "type": "AUTOMATED", "description": "Verify 2.4 GHz 802.11 b/g/n Wi-Fi link and RSSI stability."},
    {"step": 3, "name": "HiveMQ MQTT TLS Connection", "type": "AUTOMATED", "description": "Verify secure TLS 8883 MQTT connection to HiveMQ Cloud."},
    {"step": 4, "name": "Heartbeat Verified", "type": "AUTOMATED", "description": "Verify periodic heartbeat arrivals <= 15 seconds."},
    {"step": 5, "name": "PZEM Communication", "type": "AUTOMATED", "description": "Verify UART telemetry from PZEM-004T V3.0 system meter (TX:16, RX:17)."},
    {"step": 6, "name": "ZMPT CH1 Verified", "type": "AUTOMATED", "description": "Verify AC voltage reading on CH1 (GPIO4 ADC). Plausible 190-250 V."},
    {"step": 7, "name": "ZMPT CH2 Verified", "type": "AUTOMATED", "description": "Verify AC voltage reading on CH2 (GPIO5 ADC). Plausible 190-250 V."},
    {"step": 8, "name": "ZMPT CH3 Verified", "type": "AUTOMATED", "description": "Verify AC voltage reading on CH3 (GPIO6 ADC). Plausible 190-250 V."},
    {"step": 9, "name": "ZMPT CH4 Verified", "type": "AUTOMATED", "description": "Verify AC voltage reading on CH4 (GPIO7 ADC). Plausible 190-250 V."},
    {"step": 10, "name": "ACS712 CH1 Verified", "type": "AUTOMATED", "description": "Verify zero-current baseline and current measurement on CH1 (GPIO8 ADC)."},
    {"step": 11, "name": "ACS712 CH2 Verified", "type": "AUTOMATED", "description": "Verify zero-current baseline and current measurement on CH2 (GPIO9 ADC)."},
    {"step": 12, "name": "ACS712 CH3 Verified", "type": "AUTOMATED", "description": "Verify zero-current baseline and current measurement on CH3 (GPIO10 ADC)."},
    {"step": 13, "name": "ACS712 CH4 Verified", "type": "AUTOMATED", "description": "Verify zero-current baseline and current measurement on CH4 (GPIO1 ADC)."},
    {"step": 14, "name": "Main Relay Output Tests", "type": "OPERATOR_GUIDED", "description": "Sequentially command CH1-4 Main Relays (GPIO 12, 13, 14, 15)."},
    {"step": 15, "name": "Aux Relay Output Tests", "type": "OPERATOR_GUIDED", "description": "Sequentially command CH1-4 Aux Relays (GPIO 18, 11, 38, 21)."},
    {"step": 16, "name": "Active-Power Validation", "type": "OPERATOR_GUIDED", "description": "Compare GridGuard discrete active power calculation against reference meter."},
    {"step": 17, "name": "Protection Threshold Tests", "type": "AUTOMATED", "description": "Validate 7 W (Assistive load) and 12 W (Overload trip) policies."},
    {"step": 18, "name": "TRIP Test", "type": "OPERATOR_GUIDED", "description": "Verify face-authorized manual remote trip de-energizes relays and latches fault."},
    {"step": 19, "name": "RESET Test", "type": "OPERATOR_GUIDED", "description": "Verify face-authorized reset restores channel under safe electrical conditions."},
    {"step": 20, "name": "Commissioning Complete", "type": "VERIFICATION", "description": "Final review and transition to HARDWARE_VALIDATED state."}
]

class HardwareCommissioningService:
    def __init__(self):
        self.reset()

    def reset(self):
        self.started_at: Optional[str] = None
        self.completed_at: Optional[str] = None
        self.current_step: int = 1
        self.step_states: Dict[int, Dict[str, Any]] = {}
        for s in COMMISSIONING_STEPS:
            self.step_states[s["step"]] = {
                "step": s["step"],
                "name": s["name"],
                "type": s["type"],
                "description": s["description"],
                "status": "PENDING", # PENDING, RUNNING, PASSED, FAILED, SKIPPED
                "executed_at": None,
                "notes": ""
            }

        # 8 Relay Guided Test States (Commanded state only; physical feedback is NOT_AVAILABLE)
        self.relay_tests: Dict[str, Dict[str, Any]] = {
            "CH1_MAIN": {"channel": 1, "relay": "MAIN", "gpio": 12, "tested_on": False, "tested_off": False, "status": "UNTESTED"},
            "CH1_AUX":  {"channel": 1, "relay": "AUX",  "gpio": 18, "tested_on": False, "tested_off": False, "status": "UNTESTED"},
            "CH2_MAIN": {"channel": 2, "relay": "MAIN", "gpio": 13, "tested_on": False, "tested_off": False, "status": "UNTESTED"},
            "CH2_AUX":  {"channel": 2, "relay": "AUX",  "gpio": 11, "tested_on": False, "tested_off": False, "status": "UNTESTED"},
            "CH3_MAIN": {"channel": 3, "relay": "MAIN", "gpio": 14, "tested_on": False, "tested_off": False, "status": "UNTESTED"},
            "CH3_AUX":  {"channel": 3, "relay": "AUX",  "gpio": 38, "tested_on": False, "tested_off": False, "status": "UNTESTED"},
            "CH4_MAIN": {"channel": 4, "relay": "MAIN", "gpio": 15, "tested_on": False, "tested_off": False, "status": "UNTESTED"},
            "CH4_AUX":  {"channel": 4, "relay": "AUX",  "gpio": 21, "tested_on": False, "tested_off": False, "status": "UNTESTED"},
        }

        # Reference Power Comparison (GridGuard Active Power vs Calibration Reference)
        self.power_validations: Dict[int, Dict[str, Any]] = {
            1: {"channel": 1, "gridguard_active_power": None, "reference_active_power": None, "absolute_error": None, "error_pct": None, "calibration_status": "CALIBRATION_UNVALIDATED", "gridguard_w": None, "reference_w": None, "error_w": None, "status": "PENDING"},
            2: {"channel": 2, "gridguard_active_power": None, "reference_active_power": None, "absolute_error": None, "error_pct": None, "calibration_status": "CALIBRATION_UNVALIDATED", "gridguard_w": None, "reference_w": None, "error_w": None, "status": "PENDING"},
            3: {"channel": 3, "gridguard_active_power": None, "reference_active_power": None, "absolute_error": None, "error_pct": None, "calibration_status": "CALIBRATION_UNVALIDATED", "gridguard_w": None, "reference_w": None, "error_w": None, "status": "PENDING"},
            4: {"channel": 4, "gridguard_active_power": None, "reference_active_power": None, "absolute_error": None, "error_pct": None, "calibration_status": "CALIBRATION_UNVALIDATED", "gridguard_w": None, "reference_w": None, "error_w": None, "status": "PENDING"},
        }

    def start(self):
        self.reset()
        self.started_at = datetime.datetime.utcnow().isoformat()
        self.step_states[1]["status"] = "RUNNING"
        return self.get_status()

    def get_status(self) -> Dict[str, Any]:
        passed_count = sum(1 for s in self.step_states.values() if s["status"] == "PASSED")
        all_steps_passed = (passed_count == len(COMMISSIONING_STEPS))
        all_relays_passed = all(r.get("status") == "PASSED" for r in self.relay_tests.values())
        all_power_passed = all(
            p.get("calibration_status") == "VALIDATED" or p.get("status") == "PASSED"
            for p in self.power_validations.values()
            if p.get("gridguard_active_power") is not None or p.get("gridguard_w") is not None
        ) and all(
            (p.get("gridguard_active_power") is not None or p.get("gridguard_w") is not None)
            for p in self.power_validations.values()
        )
        is_complete = all_steps_passed and all_relays_passed and all_power_passed

        return {
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "current_step": self.current_step,
            "passed_count": passed_count,
            "total_steps": len(COMMISSIONING_STEPS),
            "all_steps_passed": all_steps_passed,
            "all_relays_passed": all_relays_passed,
            "all_power_passed": all_power_passed,
            "is_complete": is_complete,
            "warning": "SIMULATOR VALIDATION DOES NOT CONSTITUTE PHYSICAL HARDWARE VALIDATION.",
            "steps": list(self.step_states.values()),
            "relay_tests": self.relay_tests,
            "power_validations": self.power_validations,
        }

    def execute_step(self, step_id: int, passed: bool, notes: str = "") -> Dict[str, Any]:
        if step_id not in self.step_states:
            raise ValueError(f"Invalid commissioning step {step_id}")

        # Requirement 4: Protection validation MUST BE BLOCKED until power measurement is verified
        if step_id in [17, 18, 19] and passed:
            step16 = self.step_states.get(16, {})
            if step16.get("status") != "PASSED":
                raise ValueError("Protection validation blocked: Step 16 (Active-Power Validation) must be completed and passed first.")
            unvalidated_channels = [
                ch for ch, rec in self.power_validations.items()
                if rec.get("calibration_status") != "VALIDATED" and rec.get("status") != "PASSED"
            ]
            if unvalidated_channels:
                raise ValueError(
                    f"Protection validation blocked: Active-power measurement must be checked against reference meter for all channels (CH{unvalidated_channels} unvalidated) before protection threshold testing."
                )

        # Requirement 5: Final hardware validation checks
        if step_id == 20 and passed:
            untested_relays = [k for k, v in self.relay_tests.items() if v.get("status") != "PASSED"]
            if untested_relays:
                raise ValueError(f"Commissioning incomplete: All 8 relay outputs must be tested ON and OFF. Untested: {untested_relays}")
            unvalidated_channels = [
                ch for ch, rec in self.power_validations.items()
                if rec.get("calibration_status") != "VALIDATED" and rec.get("status") != "PASSED"
            ]
            if unvalidated_channels:
                raise ValueError(f"Commissioning incomplete: Active-power validation missing for channels: {unvalidated_channels}")

        now_iso = datetime.datetime.utcnow().isoformat()
        self.step_states[step_id]["status"] = "PASSED" if passed else "FAILED"
        self.step_states[step_id]["executed_at"] = now_iso
        self.step_states[step_id]["notes"] = notes

        if passed and step_id < len(COMMISSIONING_STEPS):
            self.current_step = step_id + 1
            if self.step_states[self.current_step]["status"] == "PENDING":
                self.step_states[self.current_step]["status"] = "RUNNING"
        elif not passed:
            self.current_step = step_id

        if step_id == len(COMMISSIONING_STEPS) and passed:
            self.completed_at = now_iso

        return self.get_status()

    def record_relay_test(self, channel: int, relay_type: str, action: str, operator_confirmed: bool) -> Dict[str, Any]:
        relay_key = f"CH{channel}_{relay_type.upper()}"
        if relay_key not in self.relay_tests:
            raise ValueError(f"Invalid relay key: {relay_key}")

        item = self.relay_tests[relay_key]
        if action.upper() in ["ON", "CLOSE"]:
            item["tested_on"] = operator_confirmed
        else:
            item["tested_off"] = operator_confirmed

        if item["tested_on"] and item["tested_off"]:
            item["status"] = "PASSED"
        else:
            item["status"] = "PARTIAL"

        return item

    def record_power_validation(self, channel: int, gridguard_power: float, reference_power: float) -> Dict[str, Any]:
        if channel not in self.power_validations:
            raise ValueError(f"Invalid channel {channel}")

        abs_err = round(abs(gridguard_power - reference_power), 3)
        err_pct = round((abs_err / reference_power) * 100.0, 2) if reference_power > 0 else 0.0
        status = "PASSED" if err_pct <= 5.0 else "FAILED"
        cal_status = "VALIDATED" if status == "PASSED" else "CALIBRATION_UNVALIDATED"

        record = {
            "channel": channel,
            "gridguard_active_power": round(gridguard_power, 2),
            "reference_active_power": round(reference_power, 2),
            "absolute_error": abs_err,
            "error_pct": err_pct,
            "calibration_status": cal_status,
            # Backward-compatible aliases
            "gridguard_w": round(gridguard_power, 2),
            "reference_w": round(reference_power, 2),
            "error_w": abs_err,
            "status": status,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        self.power_validations[channel] = record
        return record

commissioning_service = HardwareCommissioningService()
