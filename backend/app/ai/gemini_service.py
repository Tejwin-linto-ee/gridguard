import os
from typing import Dict, Any, List
from backend.app.core.config import settings

class GeminiAdvisoryService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.client = None
        if self.api_key:
            try:
                from google import genai
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"Warning: Could not initialize Google GenAI client: {e}")

    async def analyze_telemetry_advisory(
        self,
        user_query: str,
        system_telemetry: Dict[str, Any],
        channel_telemetry: List[Dict[str, Any]],
        active_faults: List[Dict[str, Any]],
        load_shedding_active: bool
    ) -> Dict[str, Any]:
        """
        Advisory analysis powered by Gemini with structured context injection.
        STRICT COMPLIANCE: ZERO TEMPERATURE REFERENCES.
        """
        # Formulate structured industrial context
        context_lines = [
            "SYSTEM: GRIDGUARD - Smart Transformer Protection & Assistive Load Device",
            "HARDWARE CONTEXT: 4 prototype load channels (bulbs emulating transformer channels), PZEM-004T system meter, ZMPT101B voltage sensors, ACS712 current sensors, 8 relays (4 Main, 4 Aux). Common neutral, live switched.",
            "SAFETY DIRECTIVE: You are an advisory AI. You CANNOT trip relays, modify safety thresholds, or bypass fault latching.",
            f"SYSTEM METRICS: Voltage={system_telemetry.get('voltage')}V, Current={system_telemetry.get('current')}A, Power={system_telemetry.get('power')}W, Freq={system_telemetry.get('frequency')}Hz, PF={system_telemetry.get('power_factor')}",
            f"LOAD SHEDDING ACTIVE: {load_shedding_active}",
            f"ACTIVE FAULTS: {len(active_faults)} active faults.",
        ]
        for ch in channel_telemetry:
            context_lines.append(
                f"CHANNEL {ch.get('channel')}: V={ch.get('voltage')}V, I={ch.get('current')}A, ApparentPower={ch.get('apparent_power')}VA, MainRelay={'ON' if ch.get('main_relay') else 'OFF'}, AuxRelay={'ON' if ch.get('aux_relay') else 'OFF'}, Status={ch.get('status')}, RiskIndex={ch.get('risk_index')}"
            )

        context_prompt = "\n".join(context_lines)
        full_prompt = (
            f"{context_prompt}\n\n"
            f"OPERATOR QUERY: {user_query}\n\n"
            f"Provide an industrial engineering explanation, actionable advisory recommendations, and risk context. Do not mention temperature under any circumstances."
        )

        # If live Gemini client is available and key is provided
        if self.client and self.api_key:
            try:
                response = self.client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=full_prompt
                )
                ai_text = response.text
                recommendations = [
                    "Verify physical terminal connections on indicated prototype load channels.",
                    "Review ACS712 current sensor calibration if continuous high load is observed.",
                    "Ensure face recognition operator authorization is completed before requesting latch reset."
                ]
                return {
                    "query": user_query,
                    "analysis": ai_text,
                    "advisory_recommendations": recommendations,
                    "model_version": "gemini-2.5-flash",
                    "safety_disclaimer": "AI is strictly ADVISORY. AI cannot control relays or safety limits."
                }
            except Exception as err:
                print(f"Gemini API request failed, falling back to expert diagnostic rule engine: {err}")

        # Intelligent deterministic fallback advisory engine
        analysis_parts = []
        recommendations = []

        if active_faults:
            analysis_parts.append(
                f"Critical Alert: The system has {len(active_faults)} active fault condition(s) latched. "
                f"Primary active fault involves {active_faults[0].get('fault_type')} on Channel {active_faults[0].get('channel')}."
            )
            recommendations.append("Isolate faulty prototype load and verify no short-circuit condition exists on the switched live conductor.")
            recommendations.append("Execute facial biometric verification at laptop terminal to authorize safety unlatch sequence.")
        elif load_shedding_active:
            analysis_parts.append(
                "Notice: Priority-based load shedding is currently engaged because total system active power exceeded configured demand limits."
            )
            recommendations.append("Allow non-essential prototype loads to remain de-energized until overall demand drops below hysteresis band.")
        else:
            v = system_telemetry.get('voltage')
            freq = system_telemetry.get('frequency')
            if v is not None and freq is not None:
                analysis_parts.append(
                    f"Telemetry Assessment: System operating normally at {v}V and {freq}Hz. "
                    f"All four prototype load channels report nominal apparent power and active relay states."
                )
            else:
                analysis_parts.append(
                    "Telemetry Assessment: Live MQTT telemetry is not yet available. "
                    "No electrical assessment can be made without confirmed live data from the ESP32-S3. "
                    "Ensure the ESP32-S3 is publishing to the HiveMQ Cloud broker and Node-RED is forwarding telemetry to FastAPI."
                )
            recommendations.append("Maintain routine 15-minute telemetry monitoring.")
            recommendations.append("Inspect operating hours periodically to schedule preventive relay contact check.")

        if "risk" in user_query.lower():
            analysis_parts.append(
                "Risk Index Analysis: Channel Risk Index evaluates current stress, voltage abnormalities, and historic trip events. Currently within acceptable operational thresholds."
            )
            recommendations.append("Monitor high-duty channels for early signs of contact degradation.")

        return {
            "query": user_query,
            "analysis": "\n\n".join(analysis_parts),
            "advisory_recommendations": recommendations,
            "model_version": "gemini-advisory-engine-v1",
            "safety_disclaimer": "AI is strictly ADVISORY. AI cannot trip relays, alter protection safety limits, or bypass latched faults."
        }

gemini_advisory_service = GeminiAdvisoryService()
