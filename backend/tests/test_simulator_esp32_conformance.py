"""
GRIDGUARD Conformance & Commissioning Test Suite (Section 25 & Section 33)
Validates protocol and state-machine conformance between ESP32 firmware and hardware simulator:
  T01: 5 W -> Expected NORMAL
  T02: 7 W -> Expected NORMAL
  T03: 7.1 W -> Expected HIGH_LOAD
  T04: 10 W -> Expected HIGH_LOAD
  T05: 12 W -> Expected HIGH_LOAD
  T06: 12.1 W -> Expected TRIPPED
  T07: 20 W -> Expected TRIPPED
  T08: SENSOR_INVALID -> Expected defined safety state
  T09: TRIP command -> Expected Main OFF + Aux OFF, fault latched
  T10: RESET with <=7 W -> Expected NORMAL restoration
  T11: RESET with 7-12 W -> Expected HIGH LOAD restoration
  T12: RESET with >12 W -> Expected rejection/retrip
  T13: MQTT disconnected -> Expected local protection continues
Plus:
  - 20-Step Hardware Commissioning Workflow
  - 5 Explicit Device Modes
  - 4-State Connection Rules (ONLINE, STALE, OFFLINE, WAITING FOR DEVICE)
  - Relay Chatter Prevention / Hysteresis
"""

import pytest
import datetime
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.simulator.hardware_simulator import ESP32HardwareSimulator, hardware_simulator
from backend.app.services.commissioning_service import commissioning_service

@pytest.fixture
def sim():
    instance = ESP32HardwareSimulator()
    instance.simulated_offline = False
    instance.is_connected = True
    return instance

@pytest.fixture
def client():
    return TestClient(app)

# -----------------------------------------------------------------------------
# CONFORMANCE TEST MATRIX: T01 - T13
# -----------------------------------------------------------------------------

def test_t01_power_5w_normal(sim):
    """T01: 5 W -> Expected NORMAL (Main ON, Aux OFF)"""
    sim.set_channel_target_power(1, 5.0)
    ch = sim.channels[1]
    assert ch["status"] == "NORMAL"
    assert ch["main_relay"] is True
    assert ch["aux_relay"] is False
    assert ch["fault_latched"] is False

def test_t02_power_7w_normal_boundary(sim):
    """T02: 7 W -> Expected NORMAL (Main ON, Aux OFF)"""
    sim.set_channel_target_power(1, 7.0)
    ch = sim.channels[1]
    assert ch["status"] == "NORMAL"
    assert ch["main_relay"] is True
    assert ch["aux_relay"] is False
    assert ch["fault_latched"] is False

def test_t03_power_7_1w_high_load(sim):
    """T03: 7.1 W -> Expected HIGH_LOAD (Main ON, Aux ON)"""
    sim.set_channel_target_power(1, 7.1)
    ch = sim.channels[1]
    assert ch["status"] == "HIGH LOAD"
    assert ch["main_relay"] is True
    assert ch["aux_relay"] is True
    assert ch["fault_latched"] is False

def test_t04_power_10w_high_load(sim):
    """T04: 10 W -> Expected HIGH_LOAD (Main ON, Aux ON)"""
    sim.set_channel_target_power(1, 10.0)
    ch = sim.channels[1]
    assert ch["status"] == "HIGH LOAD"
    assert ch["main_relay"] is True
    assert ch["aux_relay"] is True
    assert ch["fault_latched"] is False

def test_t05_power_12w_high_load_boundary(sim):
    """T05: 12 W -> Expected HIGH_LOAD (Main ON, Aux ON)"""
    sim.set_channel_target_power(1, 12.0)
    ch = sim.channels[1]
    assert ch["status"] == "HIGH LOAD"
    assert ch["main_relay"] is True
    assert ch["aux_relay"] is True
    assert ch["fault_latched"] is False

def test_t06_power_12_1w_tripped_boundary(sim):
    """T06: 12.1 W -> Expected TRIPPED (Main OFF, Aux OFF, Fault Latched)"""
    sim.set_channel_target_power(1, 12.1)
    ch = sim.channels[1]
    assert ch["status"] == "TRIPPED"
    assert ch["main_relay"] is False
    assert ch["aux_relay"] is False
    assert ch["fault_latched"] is True

def test_t07_power_20w_tripped_overload(sim):
    """T07: 20 W -> Expected TRIPPED (Main OFF, Aux OFF, Fault Latched)"""
    sim.set_channel_target_power(1, 20.0)
    ch = sim.channels[1]
    assert ch["status"] == "TRIPPED"
    assert ch["main_relay"] is False
    assert ch["aux_relay"] is False
    assert ch["fault_latched"] is True

def test_t08_sensor_invalid_safety_state(sim):
    """T08: SENSOR_INVALID -> Defined safety state (electrical metrics None, status SENSOR INVALID)"""
    sim.set_channel_sensor_health(1, "SENSOR_INVALID")
    ch = sim.channels[1]
    assert ch["sensor_health"] == "SENSOR_INVALID"
    assert ch["status"] == "SENSOR INVALID"
    assert ch["voltage"] is None
    assert ch["active_power"] is None

def test_t09_trip_command_execution(sim):
    """T09: TRIP command -> Expected Main OFF + Aux OFF, fault latched"""
    sim.set_channel_target_power(2, 6.0)
    assert sim.channels[2]["main_relay"] is True
    sim.handle_command({
        "command": "TRIP_CHANNEL",
        "channel": 2,
        "authorized_by": "OP-VALIDATION",
        "authorization_id": "AUTH-T09",
        "correlation_id": "CORR-T09-001"
    })
    ch = sim.channels[2]
    assert ch["main_relay"] is False
    assert ch["aux_relay"] is False
    assert ch["status"] == "TRIPPED"
    assert ch["fault_latched"] is True

def test_t10_reset_with_low_power_normal_restoration(sim):
    """T10: RESET with <= 7 W -> Expected NORMAL restoration"""
    # Force trip
    sim.set_channel_target_power(3, 15.0)
    assert sim.channels[3]["fault_latched"] is True

    # Drop load to 5 W and reset
    sim.active_power_targets[3] = 5.0
    sim.handle_command({
        "command": "RESET",
        "channel": 3,
        "authorized_by": "OP-VALIDATION",
        "authorization_id": "AUTH-T10",
        "correlation_id": "CORR-T10-001"
    })
    ch = sim.channels[3]
    assert ch["status"] == "NORMAL"
    assert ch["main_relay"] is True
    assert ch["aux_relay"] is False
    assert ch["fault_latched"] is False

def test_t11_reset_with_medium_power_high_load_restoration(sim):
    """T11: RESET with 7-12 W -> Expected HIGH LOAD restoration"""
    # Force trip
    sim.set_channel_target_power(4, 16.0)
    assert sim.channels[4]["fault_latched"] is True

    # Set load to 9 W and reset
    sim.active_power_targets[4] = 9.0
    sim.handle_command({
        "command": "RESET",
        "channel": 4,
        "authorized_by": "OP-VALIDATION",
        "authorization_id": "AUTH-T11",
        "correlation_id": "CORR-T11-001"
    })
    ch = sim.channels[4]
    assert ch["status"] == "HIGH LOAD"
    assert ch["main_relay"] is True
    assert ch["aux_relay"] is True
    assert ch["fault_latched"] is False

def test_t12_reset_with_high_power_rejection(sim):
    """T12: RESET with > 12 W -> Expected rejection/retrip"""
    # Force trip
    sim.set_channel_target_power(1, 14.0)
    assert sim.channels[1]["fault_latched"] is True

    # Attempt reset with load remaining at 14 W
    sim.active_power_targets[1] = 14.0
    sim.handle_command({
        "command": "RESET",
        "channel": 1,
        "authorized_by": "OP-VALIDATION",
        "authorization_id": "AUTH-T12",
        "correlation_id": "CORR-T12-001"
    })
    ch = sim.channels[1]
    assert ch["status"] == "TRIPPED"
    assert ch["main_relay"] is False
    assert ch["aux_relay"] is False
    assert ch["fault_latched"] is True

def test_t13_local_protection_continuity_during_mqtt_loss(sim):
    """T13: MQTT disconnected -> Local protection continues without interruption"""
    sim.is_connected = False
    sim.simulated_offline = True

    # Overload occurs while offline
    sim.set_channel_target_power(2, 18.0)
    ch = sim.channels[2]
    assert ch["status"] == "TRIPPED"
    assert ch["main_relay"] is False
    assert ch["aux_relay"] is False
    assert ch["fault_latched"] is True

# -----------------------------------------------------------------------------
# RELAY CHATTER PREVENTION & HYSTERESIS TEST
# -----------------------------------------------------------------------------

def test_relay_chatter_prevention_at_7w_boundary(sim):
    """
    Validates that noisy oscillations around 7.0 W (e.g. 7.1 W -> 6.95 W)
    do not cause relay chatter due to the 200 mW hysteresis band (6.8 W - 7.0 W).
    """
    # Transition to HIGH LOAD at 7.2 W
    sim.set_channel_target_power(1, 7.2)
    assert sim.channels[1]["status"] == "HIGH LOAD"
    assert sim.channels[1]["aux_relay"] is True

    # Noise drops to 6.95 W: Hysteresis holds HIGH LOAD (above 6.8 W)
    sim.set_channel_target_power(1, 6.95)
    assert sim.channels[1]["status"] == "HIGH LOAD"
    assert sim.channels[1]["aux_relay"] is True

    # Power drops below hysteresis band to 6.5 W: Returns to NORMAL
    sim.set_channel_target_power(1, 6.5)
    assert sim.channels[1]["status"] == "NORMAL"
    assert sim.channels[1]["aux_relay"] is False

# -----------------------------------------------------------------------------
# HARDWARE COMMISSIONING WORKFLOW & DEVICE MODES
# -----------------------------------------------------------------------------

def test_commissioning_20_step_sequence(client):
    """
    Validates the complete 20-step hardware commissioning sequence:
    - 8 Relay tests (CH1-4 Main & Aux, ON & OFF)
    - Active power calibration validation against reference meter (CH1-4)
    - Protection validation blocked until active-power measurement is verified
    - Final completion guards
    """
    # 1. Start commissioning
    start_res = client.post("/api/commissioning/start")
    assert start_res.status_code == 200
    st = start_res.json()
    assert st["current_step"] == 1
    assert st["total_steps"] == 20
    assert st["is_complete"] is False

    # 2. Execute automated steps 1 through 13
    for step_num in range(1, 14):
        res = client.post(f"/api/commissioning/step/{step_num}/execute?passed=true&notes=Step_{step_num}_passed")
        assert res.status_code == 200

    # 3. Test all 8 relay outputs (CH1-4 Main and Aux, both ON and OFF)
    for ch in range(1, 5):
        for r_type in ["MAIN", "AUX"]:
            for act in ["ON", "OFF"]:
                relay_test_res = client.post(
                    f"/api/commissioning/relay-test?channel={ch}&relay_type={r_type}&action={act}&operator_confirmed=true"
                )
                assert relay_test_res.status_code == 200
                assert relay_test_res.json()["relay_feedback"] == "NOT_AVAILABLE"

    step14_res = client.post("/api/commissioning/step/14/execute?passed=true")
    assert step14_res.status_code == 200
    step15_res = client.post("/api/commissioning/step/15/execute?passed=true")
    assert step15_res.status_code == 200

    # 4. Verify that attempting protection validation (step 17) BEFORE power validation is BLOCKED
    blocked_step17 = client.post("/api/commissioning/step/17/execute?passed=true")
    assert blocked_step17.status_code == 400
    assert "Protection validation blocked" in blocked_step17.json()["detail"]

    # 5. Execute active-power reference validation for all 4 channels
    for ch in range(1, 5):
        pwr_val_res = client.post(
            f"/api/commissioning/power-validation?channel={ch}&reference_power=6.0&gridguard_power=6.05"
        )
        assert pwr_val_res.status_code == 200
        val_data = pwr_val_res.json()
        assert val_data["status"] == "PASSED"
        assert val_data["calibration_status"] == "VALIDATED"
        assert "gridguard_active_power" in val_data
        assert "reference_active_power" in val_data
        assert "absolute_error" in val_data
        assert "error_pct" in val_data

    # Step 16 passes now that power validations are complete
    step16_res = client.post("/api/commissioning/step/16/execute?passed=true")
    assert step16_res.status_code == 200

    # Protection steps 17, 18, 19 now succeed
    step17_res = client.post("/api/commissioning/step/17/execute?passed=true")
    assert step17_res.status_code == 200
    step18_res = client.post("/api/commissioning/step/18/execute?passed=true")
    assert step18_res.status_code == 200
    step19_res = client.post("/api/commissioning/step/19/execute?passed=true")
    assert step19_res.status_code == 200

    # Final step 20 executes and completes
    final_res = client.post("/api/commissioning/step/20/execute?passed=true")
    assert final_res.status_code == 200
    assert final_res.json()["is_complete"] is True

    # 6. Complete commissioning under simulator: confirms simulation warning
    comp_res = client.post("/api/commissioning/complete")
    assert comp_res.status_code == 200
    assert "SIMULATOR VALIDATION DOES NOT CONSTITUTE PHYSICAL HARDWARE VALIDATION" in comp_res.json()["warning"]

def test_five_explicit_device_modes(client):
    """Tests switching between SOFTWARE_ONLY, SIMULATOR, REAL_HARDWARE, HARDWARE_VALIDATION_PENDING, HARDWARE_VALIDATED."""
    modes = ["SOFTWARE_ONLY", "SIMULATOR", "REAL_HARDWARE", "HARDWARE_VALIDATION_PENDING", "HARDWARE_VALIDATED"]
    for m in modes:
        res = client.post(f"/api/device/mode?mode={m}")
        assert res.status_code == 200
        assert res.json()["device_mode"] == m

    # Return to SIMULATOR for regular operation
    client.post("/api/device/mode?mode=SIMULATOR")

def test_separate_device_mode_from_connection_status(client):
    """
    Requirement 1: Verify DEVICE MODE and CONNECTION STATUS are two independent state machines.
    DEVICE MODE: SOFTWARE_ONLY | SIMULATOR | REAL_HARDWARE | HARDWARE_VALIDATION_PENDING | HARDWARE_VALIDATED
    CONNECTION STATUS: WAITING_FOR_DEVICE | ONLINE | STALE | OFFLINE
    """
    # 1. Test REAL_HARDWARE with status endpoint
    client.post("/api/device/mode?mode=REAL_HARDWARE")
    sys_res = client.get("/api/system/status").json()
    assert sys_res["device_mode"] == "REAL_HARDWARE"
    assert sys_res["connection_status"] in ["WAITING_FOR_DEVICE", "ONLINE", "STALE", "OFFLINE"]

    # 2. Test HARDWARE_VALIDATION_PENDING
    client.post("/api/device/mode?mode=HARDWARE_VALIDATION_PENDING")
    sys_res = client.get("/api/system/status").json()
    assert sys_res["device_mode"] == "HARDWARE_VALIDATION_PENDING"
    assert sys_res["connection_status"] in ["WAITING_FOR_DEVICE", "ONLINE", "STALE", "OFFLINE"]

    # 3. Test SIMULATOR
    client.post("/api/device/mode?mode=SIMULATOR")
    sys_res = client.get("/api/system/status").json()
    assert sys_res["device_mode"] == "SIMULATOR"
    assert sys_res["connection_status"] in ["WAITING_FOR_DEVICE", "ONLINE", "STALE", "OFFLINE"]

