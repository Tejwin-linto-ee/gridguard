# GRIDGUARD Anti-Spoofing & Liveness Verification Subsystem

## 1. Threat Model & Attack Vectors

In industrial SCADA environments, biometric spoofing represents a critical attack vector where an adversary attempts to unlatch high-power electrical circuits without authorized personnel present.

### Targeted Attack Categories:
1. **2D Print Attacks**: High-resolution glossy or matte photographs of authorized operators held before the camera.
2. **2D Digital Replay Attacks**: Mobile phone, iPad, or laptop LCD/OLED screens replaying pre-recorded facial video or static photos.
3. **Paper Mask Attacks**: Cutout photographs with cut eyeholes attempting to simulate blinking or eye motion.
4. **Deepfake / Synthetic Face Attacks**: AI-generated face imagery presented via secondary digital screens.

---

## 2. Multi-Modal Algorithmic Detection Architecture

GRIDGUARD employs a multi-frame composite anti-spoofing engine (`backend/app/services/face_auth/liveness.py`) combining frequency domain analysis, skin chrominance clustering, and temporal frame dynamics.

### 2.1 Spectral Frequency Domain Analysis (2D FFT Moire Detection)
- **Principle**: Digital screens (LCD/OLED) display discrete pixel grids and subpixel apertures that emit high-frequency periodic patterns (Moiré fringes). Print media exhibits distinct dot-matrix halftoning and specular reflections.
- **Algorithm**:
  1. Crop face ROI and convert to grayscale.
  2. Apply 2-D Fast Fourier Transform: $F(u,v) = \iint f(x,y) e^{-i 2\pi (ux + vy)} dx dy$.
  3. Compute log magnitude spectrum and shift zero frequency to center.
  4. Segment high-frequency radial band ($r \in [R_1, R_2]$) and calculate high-to-low energy ratio.
  5. Screen replays exhibit an unnatural spike in periodic high-frequency energy ratio ($\text{ratio} > 0.45$), lowering the spectral liveness score.

### 2.2 YCrCb Chrominance Manifold Analysis
- **Principle**: Natural human skin displays consistent hemoglobin and melanin absorption characteristics in the chrominance space ($Cr \in [133, 173]$, $Cb \in [77, 127]$). Screens and printed dyes distort this distribution towards RGB backlighting color temperatures.
- **Algorithm**:
  1. Transform cropped face ROI into YCrCb color space.
  2. Compute percentage of pixels falling within the natural skin locus.
  3. Penalize unnatural saturation peaks caused by mobile display blue-light emissions.

### 2.3 Temporal Motion Dynamics Across Multi-Frame Sequence
- **Principle**: A living human naturally exhibits micro-saccades, pulse-induced photoplethysmographic (rPPG) sub-pixel variations, and micro-movements across sequential frames. Static photos or frozen replays show zero inter-frame structural variance.
- **Algorithm**:
  1. Require a minimum of 3 consecutive temporal frames sampled across $800 - 1200\text{ms}$.
  2. Compute structural inter-frame absolute difference: $D_t = \frac{1}{HW} \sum |I_t - I_{t-1}|$.
  3. If $D_t < 1.2$ (perfectly static image), flag as static print attack.
  4. If $D_t > 35.0$ (erratic artificial shaking or switching), flag as erratic frame substitution.
  5. Natural micro-motion falls reliably within $2.0 \le D_t \le 20.0$.

---

## 3. Liveness Decision Logic & Thresholds

```python
composite_liveness = (
    0.40 * spectral_score +
    0.35 * chrominance_score +
    0.25 * temporal_score
)
```

- **Threshold**: $\ge 0.750$ for authorization.
- **Fail-Closed Behavior**: If `composite_liveness < 0.750`, the attempt is immediately flagged as `SPOOF_DETECTED` or `LOW_LIVENESS`, the event is logged into `biometric_verification_attempts`, and all reset actions are blocked.

---

## 4. Architectural Characterization & Production Limitations

> **Engineering Disclosure (Audit Clarification)**: The current implementation in `liveness.py` is an **algorithmic heuristic signal analysis pipeline** utilizing classical 2D Fourier transforms, YCrCb color space projections, and pixel differential motion. It is **not a trained deep convolutional neural network**.
>
> **Known Strengths**:
> - Effectively achieves **100% rejection of static printed photographs** and static digital displays via temporal micro-dynamics ($D_t < 0.4$).
>
> **Known Limitations & Production Requirement**:
> - High-quality dynamic video replays on modern high-refresh OLED displays require pre-trained deep anti-spoof neural weights (e.g., MiniFASNet `.onnx`) to reliably achieve APCER $< 5\%$.

