from typing import Dict, Any

class RiskIndexCalculator:
    """
    Computes the 'Project-defined Channel Risk Index' (0-100).
    Important note per system specification:
    This is an engineering risk estimation metric, NOT a certified transformer health percentage.
    """
    def calculate_channel_risk(
        self,
        channel: int,
        voltage: float,
        current: float,
        overload_count: int,
        trip_count: int,
        operating_hours: float
    ) -> Dict[str, Any]:
        # If telemetry is missing, return unavailable status (strictly no fake zero risk)
        if voltage is None or current is None:
            return {
                "channel": channel,
                "risk_score": None,
                "trend": "RISK UNAVAILABLE — INSUFFICIENT LIVE DATA",
                "current_stress_contribution": None,
                "voltage_stability_contribution": None,
                "trip_frequency_contribution": None,
                "overload_duration_contribution": None,
                "summary": "RISK UNAVAILABLE — INSUFFICIENT LIVE DATA",
                "metric_designation": "Project-defined Channel Risk Index"
            }

        # Baseline score: 5.0
        score = 5.0

        # 1. Current Stress Factor (0 - 35 points)
        # Nominal for prototype load is ~0.5A - 1.2A. Stress escalates above 1.8A
        current_stress = 0.0
        if current > 2.2:
            current_stress = 35.0
        elif current > 1.8:
            current_stress = 20.0
        elif current > 1.4:
            current_stress = 10.0
        score += current_stress

        # 2. Voltage Stability Factor (0 - 20 points)
        # Nominal is 220V - 240V. Deviation outside 210-245 adds risk
        voltage_stress = 0.0
        if voltage < 200.0 or voltage > 245.0:
            voltage_stress = 20.0
        elif voltage < 215.0 or voltage > 235.0:
            voltage_stress = 10.0
        score += voltage_stress

        # 3. Trip History Factor (0 - 25 points)
        trip_factor = min(25.0, trip_count * 8.0)
        score += trip_factor

        # 4. Overload Count Factor (0 - 15 points)
        overload_factor = min(15.0, overload_count * 3.0)
        score += overload_factor

        # 5. Operating Hours Aging Factor (0 - 5 points)
        hours_factor = min(5.0, (operating_hours / 500.0) * 5.0)
        score += hours_factor

        final_score = min(100.0, max(0.0, score))
        trend = "STABLE"
        if final_score > 60.0:
            trend = "INCREASING"
        elif final_score < 20.0:
            trend = "DECREASING"

        factors_summary = []
        if current_stress > 15.0:
            factors_summary.append("Elevated current draw above baseline")
        if voltage_stress > 10.0:
            factors_summary.append("Grid voltage fluctuation detected")
        if trip_factor > 10.0:
            factors_summary.append(f"{trip_count} historic protection trips logged")
        if not factors_summary:
            factors_summary.append("Normal electrical operating conditions")

        return {
            "channel": channel,
            "risk_score": round(final_score, 1),
            "trend": trend,
            "current_stress_contribution": round(current_stress, 1),
            "voltage_stability_contribution": round(voltage_stress, 1),
            "trip_frequency_contribution": round(trip_factor, 1),
            "overload_duration_contribution": round(overload_factor, 1),
            "summary": "; ".join(factors_summary),
            "metric_designation": "Project-defined Channel Risk Index"
        }

risk_calculator = RiskIndexCalculator()
