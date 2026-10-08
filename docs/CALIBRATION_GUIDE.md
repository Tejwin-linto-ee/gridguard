# GRIDGUARD — Sensor Calibration & Quality Engineering Guide

## 1. Linear Calibration Formulations (Section 4)

Due to component tolerances and temperature coefficients in passive electronics, raw ADC samples from ZMPT101B and ACS712 sensors must be calibrated using deterministic linear equations:

### Voltage Calibration (ZMPT101B)
$$V_{\text{actual}} = (V_{\text{raw}} \times V_{\text{scale}}) + V_{\text{offset}}$$

### Current Calibration (ACS712)
$$I_{\text{actual}} = (I_{\text{raw}} \times I_{\text{scale}}) + I_{\text{offset}}$$

Where:
- $V_{\text{raw}}, I_{\text{raw}}$: Direct uncalibrated readings derived from ESP32-S3 12-bit SAR ADC DMA buffers ($0 \dots 4095$ counts).
- $V_{\text{scale}}, I_{\text{scale}}$: Dimensionless gain correction factor (Default: $1.0000$).
- $V_{\text{offset}}$: Voltage zero-level adjustment in Volts (Default: $0.00\text{ V}$).
- $I_{\text{offset}}$: Residual current offset in Amperes (Default: $0.000\text{ A}$).

---

## 2. Sensor Plausibility & Health Monitoring (Section 5)

Every sample is verified against electrical sanity bounds before entering protection logic:

| Plausibility Check | Bound / Condition | Sensor State | Action |
|---|---|---|---|
| **ADC Saturation** | $\text{ADC} \ge 4090$ or $\text{ADC} \le 5$ | `BAD` | Alert SCADA: `ADC_SATURATION_DETECTED` |
| **Impossible Voltage** | $V > 290.0\text{V}$ or ($V < 50.0\text{V}$ and $V > 5.0\text{V}$) | `BAD` / `WARNING` | Alert SCADA: `ABNORMAL_VOLTAGE_BOUNDS` |
| **Impossible Current** | $I > 15.0\text{A}$ (5A prototype scale) | `BAD` | Alert SCADA: `IMPOSSIBLE_OVERCURRENT` |
| **High Derivative Jump** | $\Delta V > 65.0\text{V}$ in single 1s step | `WARNING` | Filter spike rejection active |
| **Persistent Zero** | $I = 0.00\text{A}$ with relays commanded ON | `WARNING` | Check bulb filament continuity |

---

## 3. Step-by-Step Calibration Procedure

### Step 1: Zero-Current Offset Calibration (ACS712)
1. Ensure the channel prototype bulb load is disconnected or relays are commanded OPEN.
2. In the SCADA dashboard, navigate to **Sensor Calibration** (`/calibration`).
3. Select the target channel ($1 \dots 4$).
4. Observe the **RAW VALUE (ADC)**. A healthy ACS712 at zero current sits at approximately $2.5\text{V}$ quiescent ($\sim 2048$ counts).
5. Click **Auto-Zero**. The system records the quiescent offset count into non-volatile storage and sets $I_{\text{offset}} = 0.000$.

### Step 2: Full-Load Reference Calibration
1. Connect a calibrated True-RMS laboratory bench multimeter across the prototype load terminals.
2. Energize the channel with nominal load.
3. Note the multimeter's measured voltage ($V_{\text{ref}}$) and current ($I_{\text{ref}}$).
4. Enter $V_{\text{ref}}$ and $I_{\text{ref}}$ into the **REFERENCE VALUE** fields.
5. Adjust $V_{\text{scale}}$ and $I_{\text{scale}}$ until the **ERROR %** drops below $1.0\%$:
   $$\text{Error } \% = \frac{|V_{\text{calibrated}} - V_{\text{ref}}|}{V_{\text{ref}}} \times 100\%$$
6. Enter the **CALIBRATION ENGINEER** audit signature.
7. Click **Apply & Commit Calibration**. The parameters are saved to the PostgreSQL `calibration_configs` table and logged in the immutable audit trail.
