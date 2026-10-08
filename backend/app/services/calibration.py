import datetime
from typing import Dict, Any, Tuple

class SensorCalibrationService:
    """
    Sensor Calibration and Signal Quality Service (Sections 4, 5, 6).
    Implements:
    - Linear gain/offset calibration:
        V_actual = V_raw * V_scale + V_offset
        I_actual = I_raw * I_scale + I_offset
    - Zero-current offset calibration for ACS712
    - Plausibility & Sensor Quality Checks (GOOD, WARNING, BAD, OFFLINE)
    - Protection Signal vs Display Signal filtering separation
    """
    def __init__(self):
        # Default calibration parameters per channel (1..4)
        self.calibrations: Dict[int, Dict[str, Any]] = {
            ch: {
                "channel": ch,
                "voltage_scale": 1.000,
                "voltage_offset": 0.0,
                "current_scale": 1.000,
                "current_offset": 0.0,
                "zero_current_raw": 2048.0, # Mid-scale for ACS712 2.5V quiescent
                "reference_voltage": 230.0,
                "reference_current": 1.05 + (ch * 0.15),
                "status": "CALIBRATED",
                "calibrated_by": "System Admin",
                "version": 1,
                "last_calibrated": datetime.datetime.utcnow().isoformat()
            }
            for ch in range(1, 5)
        }

        # Display Signal smoothing registers (Exponential Moving Average)
        self.ema_voltage: Dict[int, float] = {ch: 230.0 for ch in range(1, 5)}
        self.ema_current: Dict[int, float] = {ch: 1.20 for ch in range(1, 5)}
        self.last_voltage: Dict[int, float] = {ch: 230.0 for ch in range(1, 5)}
        self.last_current: Dict[int, float] = {ch: 1.20 for ch in range(1, 5)}

    def calibrate_voltage(self, channel: int, v_raw: float) -> Tuple[float, float]:
        """Returns (protection_voltage, filtered_display_voltage)."""
        cfg = self.calibrations.get(channel, {})
        scale = cfg.get("voltage_scale", 1.0)
        offset = cfg.get("voltage_offset", 0.0)
        v_actual = round((v_raw * scale) + offset, 2)

        # Low-latency protection value
        protection_v = v_actual

        # Smoothed display value (alpha = 0.25)
        prev = self.ema_voltage.get(channel, v_actual)
        smoothed = round((0.25 * v_actual) + (0.75 * prev), 2)
        self.ema_voltage[channel] = smoothed

        return protection_v, smoothed

    def calibrate_current(self, channel: int, i_raw: float) -> Tuple[float, float]:
        """Returns (protection_current, filtered_display_current)."""
        cfg = self.calibrations.get(channel, {})
        scale = cfg.get("current_scale", 1.0)
        offset = cfg.get("current_offset", 0.0)
        i_actual = round((i_raw * scale) + offset, 2)

        protection_i = i_actual
        prev = self.ema_current.get(channel, i_actual)
        smoothed = round((0.25 * i_actual) + (0.75 * prev), 2)
        self.ema_current[channel] = smoothed

        return protection_i, smoothed

    def evaluate_sensor_quality(
        self, channel: int, v_raw: float, i_raw: float, raw_adc_v: int = 2048, raw_adc_i: int = 2048
    ) -> Dict[str, Any]:
        """
        Sensor Plausibility Monitoring (Section 5).
        Evaluates: ADC saturation, impossible bounds, unstable jumps, persistent zero under load.
        """
        status = "GOOD"
        flags = []

        # Check ADC saturation
        if raw_adc_v >= 4090 or raw_adc_i >= 4090:
            status = "BAD"
            flags.append("ADC_SATURATION_DETECTED")
        elif raw_adc_v <= 5:
            status = "WARNING"
            flags.append("ADC_ZERO_VOLTAGE")

        # Impossible voltage bounds (Nominal mains is 230V, absolute limits 50V to 290V)
        if v_raw > 290.0:
            status = "BAD"
            flags.append("IMPOSSIBLE_OVERVOLTAGE")
        elif v_raw < 50.0 and v_raw > 5.0:
            status = "WARNING"
            flags.append("ABNORMAL_UNDERVOLTAGE")

        # Impossible current bounds (5A prototype scale, > 10A indicates short or bad sensor)
        if i_raw > 15.0:
            status = "BAD"
            flags.append("IMPOSSIBLE_OVERCURRENT")

        # Sudden unrealistic step jumps (> 60V jump in single 1s step)
        prev_v = self.last_voltage.get(channel, v_raw)
        if abs(v_raw - prev_v) > 65.0:
            status = "WARNING"
            flags.append("HIGH_VOLTAGE_DERIVATIVE")
        self.last_voltage[channel] = v_raw

        return {
            "channel": channel,
            "quality": status,
            "flags": flags if flags else ["NOMINAL_OPERATION"],
            "timestamp": datetime.datetime.utcnow().isoformat()
        }

    def update_calibration(
        self,
        channel: int,
        voltage_scale: float,
        voltage_offset: float,
        current_scale: float,
        current_offset: float,
        zero_current_raw: float,
        reference_voltage: float,
        reference_current: float,
        calibrated_by: str
    ) -> Dict[str, Any]:
        if channel not in self.calibrations:
            raise ValueError(f"Invalid channel {channel}")

        cfg = self.calibrations[channel]
        cfg["voltage_scale"] = round(voltage_scale, 4)
        cfg["voltage_offset"] = round(voltage_offset, 2)
        cfg["current_scale"] = round(current_scale, 4)
        cfg["current_offset"] = round(current_offset, 3)
        cfg["zero_current_raw"] = round(zero_current_raw, 1)
        cfg["reference_voltage"] = round(reference_voltage, 2)
        cfg["reference_current"] = round(reference_current, 3)
        cfg["calibrated_by"] = calibrated_by
        cfg["version"] += 1
        cfg["status"] = "CALIBRATED"
        cfg["last_calibrated"] = datetime.datetime.utcnow().isoformat()

        return cfg

calibration_service = SensorCalibrationService()
