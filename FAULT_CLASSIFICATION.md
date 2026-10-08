# GRIDGUARD — FAULT CLASSIFICATION MACHINE LEARNING PIPELINE

---

## 1. Machine Learning Methodology
The Fault Classification module (`backend/app/ml/classification.py`) classifies electrical telemetry events into diagnostic fault categories:
- `NORMAL`
- `OVERCURRENT`
- `OVERVOLTAGE`
- `UNDERVOLTAGE`
- `ABNORMAL_LOAD`
- `COMMUNICATION_FAULT`
- `RELAY_FAULT`
- `SENSOR_FAULT`

---

## 2. Feature Vector: Purely Electrical (Zero Temperature)
The feature vector is strictly limited to verified electrical measurements:
$$X = \begin{bmatrix} V_{\text{RMS}} & I_{\text{RMS}} & S_{\text{VA}} & f_{\text{Hz}} & \text{PF} \end{bmatrix}$$

- **Voltage ($V_{\text{RMS}}$)**: From ZMPT101B or PZEM.
- **Current ($I_{\text{RMS}}$)**: From ACS712 or PZEM.
- **Apparent Power ($S_{\text{VA}}$)**: Voltage $\times$ Current in VA.
- **Grid Frequency ($f_{\text{Hz}}$)**: From PZEM.
- **Power Factor ($\text{PF}$)**: From PZEM.
- **STRICT PROHIBITION**: Zero temperature features. Any dataset containing `temp` or `thermal` raises an immediate validation exception.

---

## 3. Data Integrity & Cold-Start Behavior
- **Minimum Dataset Constraint**: The Random Forest classifier requires at least $50$ validated historical records and at least $2$ distinct fault classes.
- **Honest Cold-Start Fallback**: If insufficient historical telemetry exists:
  - The model does NOT generate fake or synthetic rows.
  - The API returns:
    ```json
    {
      "status": "MODEL UNAVAILABLE — INSUFFICIENT TRAINING DATA",
      "model_name": "RandomForest-FaultClassifier-v1",
      "accuracy": null,
      "precision": null,
      "recall": null,
      "f1_score": null,
      "confusion_matrix": null,
      "disclaimer": "MODEL UNAVAILABLE — INSUFFICIENT TRAINING DATA. Real operational telemetry required. Synthetic data fabrication prohibited."
    }
    ```
- **Endpoints**:
  - `GET /api/classification/metrics`: Returns pipeline training metrics, class list, and model status.
  - `POST /api/classification/predict`: Classifies live telemetry inputs.
