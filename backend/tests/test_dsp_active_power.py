"""
GRIDGUARD — AUTHORITATIVE DSP & ACTIVE-POWER MATHEMATICAL VALIDATION SUITE

Validates:
1. True AC real/active power calculation using signed instantaneous products:
   p[n] = v[n] * i[n]
   P_active = (1/N) * sum(p[n])
   Apparent Power: S = Vrms * Irms
   Power Factor: PF = P_active / S
2. Mathematical rejection of erroneous P = mean(|v * i|) rectification
3. Case A: Voltage and current in-phase (unity PF) -> Positive active power
4. Case B: Lower power factor (lagging/leading) -> Signed real power correctly computed
5. Case C: Purely reactive 90 deg phase-shifted -> Active power approaches zero
6. Case D: Reverse current polarity (180 deg) -> Active power sign changes (negative)
7. Case E: No load / sensor noise -> Active power approaches zero
8. Protection Hierarchy:
   Layer 1: Sensor validity / measurement integrity
   Layer 2: Persistent fault latch
   Layer 3: Active-power protection (<=7 W Normal, 7-12 W High Load, >12 W Trip/Latch)
   Layer 4: No undocumented 2.50 A or 13 W override
"""

import math
import random
import pytest

# Sampling parameters matching firmware/hardware_config.h
POWER_SAMPLE_COUNT = 600       # 600 samples
SAMPLE_INTERVAL_S = 0.0001     # 100 microseconds (60 ms window = 3 full 50 Hz cycles)
MAINS_FREQ_HZ = 50.0           # 50 Hz AC grid


def compute_firmware_dsp(v_samples: list[float], i_samples: list[float]):
    """
    Direct Python implementation of firmware SECTION 15 & 16:
    ADC & Active-Power DSP from esp32_gridguard_main.ino
    """
    n_samples = len(v_samples)
    assert n_samples == len(i_samples)

    sum_v2 = 0.0
    sum_i2 = 0.0
    sum_vi = 0.0

    for n in range(n_samples):
        v = v_samples[n]
        i = i_samples[n]

        sum_v2 += v * v
        sum_i2 += i * i
        sum_vi += v * i  # Signed instantaneous product p[n] = v[n] * i[n]

    v_rms = math.sqrt(sum_v2 / n_samples)
    i_rms = math.sqrt(sum_i2 / n_samples)

    # Authoritative Active Power: Signed mean of instantaneous products
    # P_active = (1/N) * sum(p[n])
    p_active = sum_vi / n_samples
    apparent_power_va = v_rms * i_rms

    pf = 0.0
    if apparent_power_va > 0.01:
        pf = p_active / apparent_power_va
        pf = max(-1.0, min(1.0, pf))

    return {
        "v_rms": v_rms,
        "i_rms": i_rms,
        "p_active": p_active,
        "apparent_power_va": apparent_power_va,
        "power_factor": pf,
    }


def compute_erroneous_rectified_power(v_samples: list[float], i_samples: list[float]):
    """
    Erroneous calculation: mean(|v[n] * i[n]|).
    Proves that taking abs() on instantaneous products is mathematically flawed.
    """
    n_samples = len(v_samples)
    sum_abs_vi = sum(abs(v * i) for v, i in zip(v_samples, i_samples))
    return sum_abs_vi / n_samples


def generate_ac_waveforms(
    v_rms: float = 230.0,
    i_rms: float = 0.030,
    phase_deg: float = 0.0,
    noise_sigma_i: float = 0.0,
):
    v_peak = v_rms * math.sqrt(2)
    i_peak = i_rms * math.sqrt(2)
    phase_rad = math.radians(phase_deg)
    omega = 2.0 * math.pi * MAINS_FREQ_HZ

    v_samples = []
    i_samples = []

    for n in range(POWER_SAMPLE_COUNT):
        t = n * SAMPLE_INTERVAL_S
        v = v_peak * math.sin(omega * t)
        noise = random.gauss(0, noise_sigma_i) if noise_sigma_i > 0 else 0.0
        i = i_peak * math.sin(omega * t - phase_rad) + noise
        v_samples.append(v)
        i_samples.append(i)

    return v_samples, i_samples


# ==============================================================================
# MATHEMATICAL DSP UNIT TESTS
# ==============================================================================

def test_case_a_in_phase_unity_pf():
    """
    Case A: Voltage and current in phase (phi = 0 deg)
    -> Positive active power, P_active == S == V_rms * I_rms
    """
    v_rms = 230.0
    i_rms = 0.02608  # ~6.0 W (Normal load)
    v_samples, i_samples = generate_ac_waveforms(v_rms, i_rms, phase_deg=0.0)

    dsp = compute_firmware_dsp(v_samples, i_samples)

    assert abs(dsp["v_rms"] - 230.0) < 0.5
    assert abs(dsp["i_rms"] - i_rms) < 0.001
    expected_p = v_rms * i_rms  # ~6.0 W
    assert abs(dsp["p_active"] - expected_p) < 0.05
    assert abs(dsp["apparent_power_va"] - expected_p) < 0.05
    assert abs(dsp["power_factor"] - 1.0) < 0.01
    assert dsp["p_active"] > 0.0


def test_case_b_lower_power_factor():
    """
    Case B: Lower power factor (phi = 60 deg, lagging)
    -> Active power remains signed real power: P = S * cos(60) = 0.50 * S
    -> Rejects rectified calculation which distorts real power
    """
    v_rms = 230.0
    i_rms = 0.080  # S = 18.4 VA
    phase_deg = 60.0
    v_samples, i_samples = generate_ac_waveforms(v_rms, i_rms, phase_deg=phase_deg)

    dsp = compute_firmware_dsp(v_samples, i_samples)
    erroneous_p = compute_erroneous_rectified_power(v_samples, i_samples)

    s_va = v_rms * i_rms
    expected_p = s_va * math.cos(math.radians(phase_deg))  # 18.4 * 0.5 = 9.2 W

    assert abs(dsp["p_active"] - expected_p) < 0.1
    assert abs(dsp["power_factor"] - 0.50) < 0.02

    # CRITICAL: Erroneous rectified power mean(|v*i|) will be ~13.5 W, which would
    # cause a FALSE OVERLOAD TRIP (>12 W) on a safe 9.2 W load!
    assert erroneous_p > 12.0
    assert dsp["p_active"] <= 12.0  # Firmware signed DSP correctly evaluates as HIGH LOAD (9.2 W)


def test_case_c_purely_reactive_approaches_zero():
    """
    Case C: Purely reactive / 90 deg phase shifted idealized signal
    -> Active power approaches zero (P_active ~ 0 W, PF ~ 0.0)
    """
    v_rms = 230.0
    i_rms = 0.050  # 11.5 VA reactive power
    v_samples, i_samples = generate_ac_waveforms(v_rms, i_rms, phase_deg=90.0)

    dsp = compute_firmware_dsp(v_samples, i_samples)
    erroneous_p = compute_erroneous_rectified_power(v_samples, i_samples)

    # Firmware signed mean correctly integrates to 0
    assert abs(dsp["p_active"]) < 0.05
    assert abs(dsp["power_factor"]) < 0.01

    # CRITICAL: Erroneous mean(|v*i|) would yield (2/pi)*S = 7.32 W!
    assert erroneous_p > 7.0


def test_case_d_reverse_current_polarity():
    """
    Case D: Reverse current polarity (phi = 180 deg)
    -> Active power sign changes cleanly: P_active = -S, PF = -1.0
    """
    v_rms = 230.0
    i_rms = 0.030
    v_samples, i_samples = generate_ac_waveforms(v_rms, i_rms, phase_deg=180.0)

    dsp = compute_firmware_dsp(v_samples, i_samples)

    expected_p = - (v_rms * i_rms)
    assert abs(dsp["p_active"] - expected_p) < 0.05
    assert abs(dsp["power_factor"] - (-1.0)) < 0.01
    assert dsp["p_active"] < 0.0


def test_case_e_no_load_sensor_noise():
    """
    Case E: No load / sensor noise (I ~ 0 + zero-mean ADC noise)
    -> Active power approaches zero (P < 0.05 W)
    """
    random.seed(42)
    v_rms = 230.0
    i_rms = 0.000  # No real load
    v_samples, i_samples = generate_ac_waveforms(v_rms, i_rms, phase_deg=0.0, noise_sigma_i=0.005)

    dsp = compute_firmware_dsp(v_samples, i_samples)

    assert abs(dsp["p_active"]) < 0.10


# ==============================================================================
# PROTECTION POLICY & HIERARCHY TESTS
# ==============================================================================

def simulate_firmware_protection(active_power_w: float, voltage_rms: float = 230.0, is_latched: bool = False):
    """
    Simulates the firmware's 7-layer protection decision engine:
    Layer 1: Sensor Validity (190V - 250V)
    Layer 2: Fault Latch
    Layer 3: Authoritative Active Power (<=7W Normal, 7-12W High, >12W Trip)
    """
    # Layer 1: Sensor Validity
    if voltage_rms < 190.0 or voltage_rms > 250.0 or math.isnan(voltage_rms):
        return {
            "state": "SENSOR_INVALID",
            "main_relay": False,
            "aux_relay": False,
            "fault_latched": False,
        }

    # Layer 2: Persistent Fault Latch
    if is_latched:
        return {
            "state": "TRIPPED",
            "main_relay": False,
            "aux_relay": False,
            "fault_latched": True,
        }

    # Layer 3: Authoritative Active Power
    if active_power_w > 12.0:
        return {
            "state": "TRIPPED",
            "main_relay": False,
            "aux_relay": False,
            "fault_latched": True,
            "trip_reason": "ACTIVE_POWER_OVER_12W",
        }
    elif active_power_w > 7.0:
        return {
            "state": "HIGH_LOAD",
            "main_relay": True,
            "aux_relay": True,
            "fault_latched": False,
        }
    else:
        return {
            "state": "NORMAL",
            "main_relay": True,
            "aux_relay": False,
            "fault_latched": False,
        }


def test_protection_benchmark_points():
    """
    Verifies the locked protection policy across all required benchmark points:
    5.0 W   -> Main ON, Aux OFF
    7.0 W   -> Main ON, Aux OFF
    7.1 W   -> Main ON, Aux ON
    12.0 W  -> Main ON, Aux ON
    12.1 W  -> Main OFF, Aux OFF, LATCH
    """
    # 5.0 W (Normal)
    p5 = simulate_firmware_protection(5.0)
    assert p5["state"] == "NORMAL" and p5["main_relay"] is True and p5["aux_relay"] is False

    # 7.0 W (Boundary Normal)
    p7 = simulate_firmware_protection(7.0)
    assert p7["state"] == "NORMAL" and p7["main_relay"] is True and p7["aux_relay"] is False

    # 7.1 W (High Load)
    p71 = simulate_firmware_protection(7.1)
    assert p71["state"] == "HIGH_LOAD" and p71["main_relay"] is True and p71["aux_relay"] is True

    # 12.0 W (Boundary High Load)
    p12 = simulate_firmware_protection(12.0)
    assert p12["state"] == "HIGH_LOAD" and p12["main_relay"] is True and p12["aux_relay"] is True

    # 12.01 W (Overload Trip)
    p121 = simulate_firmware_protection(12.01)
    assert p121["state"] == "TRIPPED" and p121["main_relay"] is False and p121["aux_relay"] is False
    assert p121["fault_latched"] is True

    # No hidden 13 W threshold: 12.5 W trips immediately
    p125 = simulate_firmware_protection(12.5)
    assert p125["state"] == "TRIPPED" and p125["fault_latched"] is True


def test_sensor_invalid_failsafe():
    """
    Verifies that voltage outside [190V, 250V] triggers SENSOR_INVALID with both relays OFF,
    and does NOT create a persistent overload fault latch.
    """
    # Voltage too low (< 190V)
    p_low = simulate_firmware_protection(6.0, voltage_rms=180.0)
    assert p_low["state"] == "SENSOR_INVALID"
    assert p_low["main_relay"] is False and p_low["aux_relay"] is False
    assert p_low["fault_latched"] is False

    # Voltage too high (> 250V)
    p_high = simulate_firmware_protection(6.0, voltage_rms=260.0)
    assert p_high["state"] == "SENSOR_INVALID"
    assert p_high["main_relay"] is False and p_high["aux_relay"] is False
    assert p_high["fault_latched"] is False
