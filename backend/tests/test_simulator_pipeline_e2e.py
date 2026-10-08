"""
GRIDGUARD Simulator Pipeline End-to-End Test Suite
===================================================
Verifies:
1. Simulator deterministic scenarios (NORMAL, HIGH_LOAD, TRIP, MIXED)
2. Authoritative 7 W / 12 W protection state machine
3. TRIP and RESET command handling with authorization
4. Decoupled health states: Physical ESP32 NOT_CONNECTED vs Simulator ONLINE
5. Node-RED service vs MQTT input vs pipeline state model
6. Zero fabrication: physical hardware is never claimed online
"""
import pytest
import datetime
from unittest.mock import MagicMock, patch

from backend.app.simulator.hardware_simulator import ESP32HardwareSimulator
from backend.app.services.health_service import AuthoritativeHealthService
from backend.app.core.config import settings


@pytest.fixture
def sim():
    simulator = ESP32HardwareSimulator(
        broker="localhost",
        port=1883,
        client_id="test_sim_e2e",
        device_id="GRIDGUARD-ESP32-SIM-TEST"
    )
    return simulator


def test_simulator_scenarios_deterministic(sim):
    """Verifies Section 10 deterministic scenarios."""
    # NORMAL: CH1=5, CH2=6, CH3=4, CH4=7 (all <= 7W -> Main ON, Aux OFF, NORMAL)
    sim.apply_scenario("NORMAL")
    assert sim.scenario == "NORMAL"
    assert sim.active_power_targets == {1: 5.0, 2: 6.0, 3: 4.0, 4: 7.0}
    for ch in range(1, 5):
        st = sim.channels[ch]
        assert st["status"] == "NORMAL"
        assert st["main_relay"] is True
        assert st["aux_relay"] is False
        assert st["fault_latched"] is False
        assert st["load"] is True

    # HIGH LOAD: CH1=8, CH2=9, CH3=10, CH4=12 (all > 7W & <= 12W -> Main ON, Aux ON)
    sim.apply_scenario("HIGH_LOAD")
    assert sim.scenario == "HIGH_LOAD"
    for ch in [1, 2, 3, 4]:
        st = sim.channels[ch]
        assert st["status"] == "HIGH LOAD"
        assert st["main_relay"] is True
        assert st["aux_relay"] is True
        assert st["fault_latched"] is False

    # TRIP: CH1=5, CH2=9, CH3=13, CH4=6 (CH3 > 12W -> Main OFF, Aux OFF, TRIPPED)
    sim.apply_scenario("TRIP")
    assert sim.scenario == "TRIP"
    ch3 = sim.channels[3]
    assert ch3["status"] == "TRIPPED"
    assert ch3["main_relay"] is False
    assert ch3["aux_relay"] is False
    assert ch3["fault_latched"] is True
    assert ch3["fault"] == "ACTIVE_POWER_OVER_12W"

    # MIXED: CH1=6, CH2=9, CH3=13, CH4=7
    sim.apply_scenario("MIXED")
    assert sim.scenario == "MIXED"
    assert sim.channels[1]["status"] == "NORMAL"
    assert sim.channels[2]["status"] == "HIGH LOAD"
    assert sim.channels[3]["status"] == "TRIPPED"
    assert sim.channels[4]["status"] == "NORMAL"


def test_simulator_trip_command(sim):
    """Verifies operator TRIP command on channel 2."""
    sim.apply_scenario("NORMAL")
    assert sim.channels[2]["status"] == "NORMAL"

    payload = {
        "command": "TRIP_CHANNEL",
        "channel": 2,
        "authorized_by": "Operator-01",
        "authorization_id": "AUTH-TEST-001",
        "correlation_id": "CORR-TRIP-999"
    }
    sim.handle_command(payload)

    ch2 = sim.channels[2]
    assert ch2["status"] == "TRIPPED"
    assert ch2["main_relay"] is False
    assert ch2["aux_relay"] is False
    assert ch2["fault_latched"] is True
    assert ch2["fault"] == "REMOTE_OPERATOR_TRIP"


def test_simulator_reset_command_safe_restoration(sim):
    """Verifies operator RESET command with authorization."""
    # First trip CH2
    sim.apply_scenario("NORMAL")
    sim.set_channel_target_power(2, 6.0)
    sim.channels[2]["fault_latched"] = True
    sim.channels[2]["main_relay"] = False
    sim.channels[2]["aux_relay"] = False
    sim.channels[2]["status"] = "TRIPPED"

    # Unauthorized reset (missing auth id) -> rejected
    unauth_payload = {
        "command": "RESET",
        "channel": 2,
        "authorized_by": "Operator-01",
        "authorization_id": "",
        "correlation_id": "CORR-FAIL-1"
    }
    sim.handle_command(unauth_payload)
    assert sim.channels[2]["status"] == "TRIPPED"

    # Authorized reset -> restored to NORMAL (6W <= 7W)
    auth_payload = {
        "command": "RESET",
        "channel": 2,
        "authorized_by": "Chief Engineer",
        "authorization_id": "AUTH-RESET-888",
        "correlation_id": "CORR-OK-1"
    }
    sim.handle_command(auth_payload)
    assert sim.channels[2]["status"] == "NORMAL"
    assert sim.channels[2]["main_relay"] is True
    assert sim.channels[2]["aux_relay"] is False
    assert sim.channels[2]["fault_latched"] is False


def test_simulator_reset_re_trips_if_still_overload(sim):
    """If target power is > 12W, RESET attempt must re-trip."""
    sim.apply_scenario("TRIP") # CH3 target = 13W
    assert sim.channels[3]["status"] == "TRIPPED"

    auth_payload = {
        "command": "RESET",
        "channel": 3,
        "authorized_by": "Operator-01",
        "authorization_id": "AUTH-FAIL-OVERLOAD",
        "correlation_id": "CORR-RETRIP-1"
    }
    sim.handle_command(auth_payload)
    # Load is still > 12W, so it must remain TRIPPED
    assert sim.channels[3]["status"] == "TRIPPED"
    assert sim.channels[3]["main_relay"] is False
    assert sim.channels[3]["aux_relay"] is False
    assert sim.channels[3]["fault_latched"] is True


@pytest.mark.asyncio
async def test_health_service_decoupled_states():
    """Verifies that physical ESP32 remains NOT_CONNECTED while simulator is ONLINE."""
    hs = AuthoritativeHealthService()

    # Record simulator heartbeat
    hs.record_device_heartbeat(
        device_id="GRIDGUARD-ESP32-SIM-001",
        device_mode="SIMULATOR",
        hardware_type="HARDWARE_SIMULATOR",
        uptime_sec=120,
        mqtt_connected=True,
        scenario="NORMAL"
    )

    # Physical ESP32 has received NO heartbeat
    assert hs.is_physical_esp32_online() is False
    assert hs.is_simulator_online() is True

    # Simulate Node-RED forwarding telemetry to FastAPI
    hs.record_nodered_ingestion(
        endpoint="/api/telemetry/system",
        device_id="GRIDGUARD-ESP32-SIM-001",
        msg_type="SYSTEM"
    )

    current_sys = {
        "voltage": 230.1,
        "current": 0.095,
        "power": 22.0,
        "data_source": "SIMULATED HARDWARE",
        "device_mode": "SIMULATOR",
        "device_id": "GRIDGUARD-ESP32-SIM-001",
        "last_update": datetime.datetime.utcnow(),
        "has_live_data": True
    }
    current_ch = {
        ch: {"channel": ch, "voltage": 230.1, "status": "NORMAL"} for ch in range(1, 5)
    }

    # Mock external network probes for deterministic test
    with patch.object(hs, "probe_nodered", return_value=("ONLINE", 5.0, "HTTP 200", datetime.datetime.utcnow())), \
         patch.object(hs, "probe_mqtt_broker", return_value=("AVAILABLE", 15.0, "TLS 8883 reachable", datetime.datetime.utcnow())), \
         patch.object(hs, "probe_database", return_value=("ONLINE", 2.0, "SELECT 1 OK", datetime.datetime.utcnow())):

        health = await hs.get_system_health(current_sys, current_ch)

        # 1. Physical ESP32 is NOT CONNECTED
        assert health.physical_esp32.status == "NOT_CONNECTED"

        # 2. Simulator is ONLINE
        assert health.simulator.status == "ONLINE"

        # 3. Simulator MQTT is CONNECTED
        assert health.simulator_mqtt.status == "CONNECTED"

        # 4. Node-RED Service is ONLINE
        assert health.node_red.status == "ONLINE"

        # 5. Node-RED MQTT Input is LIVE (recent ingestion)
        assert health.node_red_mqtt.status == "LIVE"

        # 6. Node-RED Ingestion Pipeline is RECEIVING
        assert health.node_red_pipeline.status == "RECEIVING"

        # 7. Overall mode is SIMULATOR
        assert health.device_mode == "SIMULATOR"
        assert health.telemetry_source == "SIMULATOR"

        # 8. Telemetry stream is LIVE — SIMULATOR
        assert health.live_telemetry.status == "LIVE — SIMULATOR"
