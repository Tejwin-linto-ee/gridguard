# GRIDGUARD — DYNAMIC LOAD FORECASTING

---

## 1. Forecasting Architecture
Dynamic Load Forecasting (`backend/app/ml/forecasting.py`) projects future system demand ($W$) across three operational horizons:
- **15-Minute Projection** ($\hat{P}_{15\text{m}}$)
- **30-Minute Projection** ($\hat{P}_{30\text{m}}$)
- **60-Minute Projection** ($\hat{P}_{60\text{m}}$)

The algorithm leverages Ridge Time-Series Regression trained on historical prototype load profiles.

---

## 2. Cold-Start Contract: Anti-Fabrication
When live system telemetry has not yet arrived or electrical metrics are unavailable:
- The system **NEVER fabricates synthetic historical curves or sine waves**.
- The API responds honestly:
  ```json
  {
    "current_load_w": null,
    "forecast_15m": {
      "predicted_load_w": null,
      "trend": "FORECAST UNAVAILABLE — INSUFFICIENT LIVE DATA"
    },
    "forecast_30m": {
      "predicted_load_w": null,
      "trend": "FORECAST UNAVAILABLE — INSUFFICIENT LIVE DATA"
    },
    "forecast_60m": {
      "predicted_load_w": null,
      "trend": "FORECAST UNAVAILABLE — INSUFFICIENT LIVE DATA"
    },
    "disclaimer": "FORECAST UNAVAILABLE — INSUFFICIENT LIVE DATA"
  }
  ```
- In the frontend dashboard (`/forecasting`), KPI cards and charts display `"---"` and an informative SCADA panel: `"FORECAST UNAVAILABLE — INSUFFICIENT LIVE DATA"`.

---

## 3. Zero Temperature Invariant
All features are purely electrical:
- Real-time Active Power ($P_W$)
- RMS Voltage ($V$)
- Total Current ($I$)
- Grid Frequency ($f$)
- Power Factor ($\text{PF}$)
- Hour of Day & Day of Week time features
- **ZERO thermal or temperature variables are used**.
