"""
GRIDGUARD HARDWARE SIMULATOR & HARDWARE VALIDATION TEST MATRIX
==============================================================
Tests the complete end-to-end hardware-ready software validation:
1. Simulator Protocol Compatibility & Deterministic Scenarios
2. Telemetry Ingestion (Zero Temperature, Authoritative Active Power)
3. Offline / Online / Reconnect Simulation
4. Biometric Face Authorization Enforcement (Trip & Reset Gates)
5. Pre-Closure Electrical Safety Validation (> 12 W Protection Ceiling)
6. Staged Relay Restoration (7 W / 12 W Policy: Main first -> Stabilization -> Aux assist)
7. Command State Machine & Correlation ID Tracking
8. Clear Distinction: SIMULATOR vs REAL_HARDWARE (No Faking)
"""

import pytest
import asyncio
from httpx import AsyncClient, ASGITransport

from backend.app.main import app
from backend.app.core.config import settings
from backend.app.api.endpoints import (
    current_system_state, current_channels_state,
    pending_commands, command_audit_log, handle_mqtt_telemetry
)
from backend.app.simulator.hardware_simulator import ESP32HardwareSimulator, hardware_simulator
from backend.app.services.face_auth.policy import reset_policy_engine
from backend.app.services.health_service import health_service


# --------------------------------------------------------------------------
# A. SIMULATOR SCENARIOS & PROTECTION STATE MACHINE
# --------------------------------------------------------------------------
def test_simulator_scenarios_deterministic_protection():
    sim = ESP32HardwareSimulator()

    # Scenario 1: NORMAL (CH1=5W, CH2=6W, CH3=4W, CH4=7W)
    sim.apply_scenario("NORMAL")
    assert sim.channels[1]["active_power"] == 5.0
    assert sim.channels[2]["active_power"] == 6.0
    assert sim.channels[3]["active_power"] == 4.0
    assert sim.channels[4]["active_power"] == 7.0
    for ch in range(1, 5):
        st = sim.channels[ch]
        assert st["main_relay"] is True
        assert st["aux_relay"] is False
        assert st["status"] == "NORMAL"
        assert st["fault_latched"] is False

    # Scenario 2: HIGH LOAD (CH1=8W, CH2=9W, CH3=10W, CH4=12W)
    sim.apply_scenario("HIGH_LOAD")
    assert sim.channels[1]["active_power"] == 8.0
    assert sim.channels[2]["active_power"] == 9.0
    assert sim.channels[3]["active_power"] == 10.0
    assert sim.channels[4]["active_power"] == 12.0
    for ch in range(1, 5):
        st = sim.channels[ch]
        assert st["main_relay"] is True
        assert st["aux_relay"] is True
        assert st["status"] == "HIGH LOAD"
        assert st["fault_latched"] is False

    # Scenario 3: OVERLOAD (CH1=13W, CH2=15W, CH3=20W, CH4=30W)
    sim.apply_scenario("OVERLOAD")
    assert sim.channels[1]["active_power"] == 13.0
    assert sim.channels[2]["active_power"] == 15.0
    assert sim.channels[3]["active_power"] == 20.0
    assert sim.channels[4]["active_power"] == 30.0
    for ch in range(1, 5):
        st = sim.channels[ch]
        assert st["main_relay"] is False
        assert st["aux_relay"] is False
        assert st["status"] == "TRIPPED"
        assert st["fault_latched"] is True

    # Scenario 4: MIXED (CH1=5W, CH2=9W, CH3=13W, CH4=7W)
    sim.apply_scenario("MIXED")
    assert sim.channels[1]["status"] == "NORMAL"
    assert sim.channels[1]["main_relay"] is True
    assert sim.channels[1]["aux_relay"] is False

    assert sim.channels[2]["status"] == "HIGH LOAD"
    assert sim.channels[2]["main_relay"] is True
    assert sim.channels[2]["aux_relay"] is True

    assert sim.channels[3]["status"] == "TRIPPED"
    assert sim.channels[3]["main_relay"] is False
    assert sim.channels[3]["aux_relay"] is False
    assert sim.channels[3]["fault_latched"] is True

    assert sim.channels[4]["status"] == "NORMAL"
    assert sim.channels[4]["main_relay"] is True
    assert sim.channels[4]["aux_relay"] is False


# --------------------------------------------------------------------------
# B. SIMULATOR LOCAL COMMAND EXECUTION (TRIP & RESET)
# --------------------------------------------------------------------------
def test_simulator_trip_and_reset_execution():
    sim = ESP32HardwareSimulator()
    sim.apply_scenario("NORMAL")

    # 1. Execute TRIP on CH2
    sim.handle_command({
        "command": "TRIP_CHANNEL",
        "channel": 2,
        "authorized_by": "OP-042",
        "authorization_id": "AUTH-TRIP-123",
        "correlation_id": "CORR-TRIP-CH2-001"
    })
    ch2 = sim.channels[2]
    assert ch2["main_relay"] is False
    assert ch2["aux_relay"] is False
    assert ch2["status"] == "TRIPPED"
    assert ch2["fault_latched"] is True

    # 2. Reset CH2 under Safe Load (<= 7 W)
    sim.set_channel_target_power(2, 5.8)
    sim.handle_command({
        "command": "RESET",
        "channel": 2,
        "authorized_by": "OP-042",
        "authorization_id": "AUTH-RESET-123",
        "correlation_id": "CORR-RESET-CH2-001"
    })
    assert sim.channels[2]["status"] == "NORMAL"
    assert sim.channels[2]["main_relay"] is True
    assert sim.channels[2]["aux_relay"] is False
    assert sim.channels[2]["fault_latched"] is False

    # 3. Reset CH2 under High Load (7 W < P <= 12 W) -> Aux Assist ON
    # First trip again
    sim.handle_command({
        "command": "TRIP_CHANNEL",
        "channel": 2,
        "authorized_by": "OP-042",
        "authorization_id": "AUTH-TRIP-124",
        "correlation_id": "CORR-TRIP-CH2-002"
    })
    assert sim.channels[2]["fault_latched"] is True

    sim.set_channel_target_power(2, 9.5)
    sim.handle_command({
        "command": "RESET",
        "channel": 2,
        "authorized_by": "OP-042",
        "authorization_id": "AUTH-RESET-124",
        "correlation_id": "CORR-RESET-CH2-002"
    })
    assert sim.channels[2]["status"] == "HIGH LOAD"
    assert sim.channels[2]["main_relay"] is True
    assert sim.channels[2]["aux_relay"] is True
    assert sim.channels[2]["fault_latched"] is False

    # 4. Reset CH2 under Overload Condition (> 12 W) -> Safety Trip Latched
    sim.set_channel_target_power(2, 13.5)
    sim.handle_command({
        "command": "RESET",
        "channel": 2,
        "authorized_by": "OP-042",
        "authorization_id": "AUTH-RESET-125",
        "correlation_id": "CORR-RESET-CH2-003"
    })
    assert sim.channels[2]["status"] == "TRIPPED"
    assert sim.channels[2]["main_relay"] is False
    assert sim.channels[2]["aux_relay"] is False
    assert sim.channels[2]["fault_latched"] is True


# --------------------------------------------------------------------------
# C. SIMULATOR OFFLINE / ONLINE DISCONNECT TESTING
# --------------------------------------------------------------------------
def test_simulator_offline_and_reconnect():
    sim = ESP32HardwareSimulator()
    assert sim.simulated_offline is False

    sim.set_offline()
    assert sim.simulated_offline is True
    assert sim.is_connected is False

    sim.set_online()
    assert sim.simulated_offline is False


# --------------------------------------------------------------------------
# D. API AUTHORIZATION GATES (TRIP & RESET REQUIRE FACE AUTHENTICATION)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_trip_requires_authentication():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Unauthenticated trip (no auth header/body) -> REJECTED
        res_unauth = await client.post("/api/channels/1/trip", json={})
        assert res_unauth.status_code in [401, 403]
        assert "AUTH_FAILED" in res_unauth.json()["detail"]["status"]

        # 2. Trip with invalid/expired token -> REJECTED
        res_bad_token = await client.post("/api/channels/1/trip", json={
            "authorization_token": "invalid-token-12345",
            "authorized_by": "Unknown",
            "authorization_id": "BAD-AUTH"
        })
        assert res_bad_token.status_code == 403
        assert "AUTH_FAILED" in res_bad_token.json()["detail"]["status"]

        # 3. Trip with valid biometric authorization token -> ACCEPTED
        token, meta = reset_policy_engine.generate_reset_token(
            user_id="OP-042",
            channel_id=1,
            fault_id="MAINTENANCE_TRIP",
            attempt_id="ATT-TRIP-TEST"
        )
        # Ensure device is marked online
        health_service.record_esp32_heartbeat("GRIDGUARD-ESP32-SIM-001", uptime_sec=100, wifi_rssi=-50)

        res_ok = await client.post("/api/channels/1/trip", json={
            "command": "TRIP_CHANNEL",
            "channel": 1,
            "authorized_by": "OP-042",
            "authorization_id": meta["token_hash"][:16],
            "correlation_id": meta["correlation_id"],
            "authorization_token": token
        })
        assert res_ok.status_code == 200
        assert res_ok.json()["status"] == "SENT"
        assert res_ok.json()["correlation_id"] == meta["correlation_id"]


@pytest.mark.asyncio
async def test_reset_requires_authentication_and_safety_check():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Unauthenticated reset -> REJECTED
        res_unauth = await client.post("/api/channels/2/reset", json={})
        assert res_unauth.status_code in [401, 403]

        # 2. Pre-closure safety check: active power > 12 W -> SAFETY REJECTED
        current_channels_state[2]["active_power"] = 13.5
        token, meta = reset_policy_engine.generate_reset_token(
            user_id="OP-042",
            channel_id=2,
            fault_id="OVERLOAD",
            attempt_id="ATT-SAFETY-TEST"
        )
        health_service.record_esp32_heartbeat("GRIDGUARD-ESP32-SIM-001", uptime_sec=100, wifi_rssi=-50)

        res_safety = await client.post("/api/channels/2/reset", json={
            "command": "RESET",
            "channel": 2,
            "authorized_by": "OP-042",
            "authorization_id": meta["token_hash"][:16],
            "correlation_id": meta["correlation_id"],
            "authorization_token": token
        })
        assert res_safety.status_code == 400
        assert res_safety.json()["detail"]["status"] == "SAFETY_REJECTED"

        # 3. Safe active power (6.0 W) -> ACCEPTED & SENT
        current_channels_state[2]["active_power"] = 6.0
        token2, meta2 = reset_policy_engine.generate_reset_token(
            user_id="OP-042",
            channel_id=2,
            fault_id="OVERLOAD",
            attempt_id="ATT-SAFE-TEST"
        )
        res_safe = await client.post("/api/channels/2/reset", json={
            "command": "RESET",
            "channel": 2,
            "authorized_by": "OP-042",
            "authorization_id": meta2["token_hash"][:16],
            "correlation_id": meta2["correlation_id"],
            "authorization_token": token2
        })
        assert res_safe.status_code == 200
        assert res_safe.json()["status"] == "SENT"


# --------------------------------------------------------------------------
# E. COMMAND STATE MACHINE & DEVICE CONFIRMATION
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_command_status_ingestion_and_state_machine():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        corr_id = "CORR-TEST-VERIFY-001"

        # Ingest TRIP confirmation from MQTT device
        res = await client.post("/api/commands/status", json={
            "command": "TRIP_CHANNEL",
            "accepted": True,
            "channel": 3,
            "reason": "TRIP_CONFIRMED",
            "correlation_id": corr_id
        })
        assert res.status_code == 200

        # Query command status by correlation ID
        stat_res = await client.get(f"/api/commands/status/{corr_id}")
        assert stat_res.status_code == 200
        data = stat_res.json()
        assert data["status"] == "CONFIRMED"
        assert data["reason"] == "TRIP_CONFIRMED"

        # Channel 3 state updated
        assert current_channels_state[3]["main_relay"] is False
        assert current_channels_state[3]["aux_relay"] is False
        assert current_channels_state[3]["status"] == "TRIPPED"


# --------------------------------------------------------------------------
# F. HARDWARE MODE IDENTIFICATION (SIMULATOR VS REAL ESP32)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_hardware_mode_identification_and_switch():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Default simulator status endpoint
        sim_stat = await client.get("/api/simulator/status")
        assert sim_stat.status_code == 200
        assert sim_stat.json()["device_mode"] == "SIMULATOR"

        # System status reflects active mode
        sys_stat = await client.get("/api/system/status")
        assert sys_stat.status_code == 200
        assert sys_stat.json()["device_mode"] in ["SIMULATOR", "REAL_HARDWARE"]

        # Switch mode to REAL_HARDWARE
        sw_res = await client.post("/api/device/mode?mode=REAL_HARDWARE")
        assert sw_res.status_code == 200
        assert sw_res.json()["device_mode"] == "REAL_HARDWARE"
        assert current_system_state["device_mode"] == "REAL_HARDWARE"

        # Switch back to SIMULATOR
        sw_back = await client.post("/api/device/mode?mode=SIMULATOR")
        assert sw_back.status_code == 200
        assert sw_back.json()["device_mode"] == "SIMULATOR"
        assert current_system_state["device_mode"] == "SIMULATOR"
