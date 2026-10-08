# GRIDGUARD — GOOGLE GEMINI AI ADVISORY INTEGRATION

---

## 1. Backend-Only Architecture
```
Next.js / React (Frontend)
       │ HTTP POST /api/ai/analyze (No API key)
       ▼
FastAPI Core Backend (Holds server-side GEMINI_API_KEY)
       │ Validated electrical context injection
       ▼
Google Gemini API (gemini-2.5-flash)
       │ Structured advisory response
       ▼
FastAPI Core Backend (Enforces safety filters & disclaimers)
       │
       ▼
Next.js / React Dashboard (Rendered as Advisory View)
```

### Security Directives:
- **NO FRONTEND API KEYS**: `NEXT_PUBLIC_GEMINI_API_KEY` is strictly prohibited.
- **NO DIRECT CLIENT CALLS**: The browser never connects directly to Google AI endpoints.
- **NEVER EXPOSE KEYS**: API keys are never published to MQTT topics, logged in console output, or committed to Git.

---

## 2. Advisory-Only Safety Envelope
Gemini AI is strictly **advisory**:
1. **Zero Hardware Control**: AI can NEVER trip relays, close relays, or alter GPIO outputs.
2. **Zero Safety Overrides**: AI cannot modify protection trip thresholds ($2.5\text{A}$, $250\text{V}$, etc.).
3. **Zero Biometric Overrides**: AI cannot authorize a biometric reset or bypass a latched fault.
4. **Zero Hallucinated Telemetry**: If live telemetry is unavailable, FastAPI injects:
   > *"Live telemetry is unavailable. No electrical assessment can be made."*
   Gemini is explicitly instructed never to fabricate nominal values ($230\text{V}$, $0\text{A}$, $50\text{Hz}$) or claim the system is "healthy" when unmeasured.
5. **Zero Temperature**: AI prompts explicitly state: *"Strictly zero temperature sensors exist in this prototype. Do not hypothesize thermal or temperature metrics."*

---

## 3. Response Structure
Every AI Advisory response delivers:
- **Telemetry Assessment**: Assessment of current operational values.
- **Observed Conditions**: Anomalies or patterns detected in real-time stream.
- **Possible Causes**: Root cause hypotheses based on electrical principles.
- **Recommended Checks**: Specific physical tests for maintenance technicians.
- **Safety Disclaimer**: Prominent notice that AI cannot operate hardware.
