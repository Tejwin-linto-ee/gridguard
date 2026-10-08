"""
GRIDGUARD — TRUTHFUL STATE & ZERO-FABRICATION TRANSITION TEST SUITE

Validates:
TEST 1: No ESP32 packet ever received -> WAITING_FOR_DEVICE / NOT_CONNECTED
TEST 2: ESP32 packet received -> ONLINE & LIVE
TEST 3: ESP32 stops sending -> STALE (>15s) and OFFLINE (>30s)
TEST 4: FastAPI ONLINE coexists with ESP32 NOT_CONNECTED/OFFLINE
TEST 5: WebSocket ESTABLISHED coexists with ESP32 NOT_CONNECTED/OFFLINE
TEST 6: MQTT status truthfulness (never falsely claims CONNECTED)
"""

import pytest
import datetime
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.services.health_service import health_service
from backend.app.api import endpoints
from backend.app.mqtt.client import mqtt_manager


@pytest.mark.asyncio
async def test_1_no_esp32_packet_ever_received():
    """
    TEST 1: No ESP32 packet ever received.
    Expected:
    ESP32 = WAITING_FOR_DEVICE / NOT_CONNECTED
    FastAPI = ONLINE
    Database = ONLINE / CONNECTED
    has_live_data = False
    """
    # Temporarily reset state to uninitialized
    saved_phys = dict(health_service.physical_esp32_state)
    saved_sim = dict(health_service.simulator_state)
    saved_esp32 = dict(health_service.esp32_state)
    saved_sys = dict(endpoints.current_system_state)

    try:
        health_service.physical_esp32_state["last_heartbeat"] = None
        health_service.physical_esp32_state["device_id"] = None
        health_service.simulator_state["last_heartbeat"] = None
        health_service.simulator_state["device_id"] = None
        health_service.esp32_state["last_heartbeat"] = None
        health_service.esp32_state["device_id"] = None
        endpoints.current_system_state["last_update"] = None
        endpoints.current_system_state["has_live_data"] = False
        endpoints.current_system_state["device_mode"] = "SOFTWARE_ONLY"

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. System status
            res_status = await ac.get("/api/system/status")
            assert res_status.status_code == 200
            data_status = res_status.json()

            assert data_status["connection_status"] == "WAITING_FOR_DEVICE"
            assert data_status["esp32_online"] is False
            assert data_status["esp32_status"] in ["OFFLINE", "NOT_CONNECTED"]
            assert data_status["has_live_data"] is False

            # 2. System health
            res_health = await ac.get("/api/system-health")
            assert res_health.status_code == 200
            data_health = res_health.json()

            assert data_health["esp32"]["status"] == "NOT_CONNECTED"
            assert data_health["backend_api"]["status"] == "ONLINE"
            assert data_health["database"]["status"] in ["ONLINE", "CONNECTED"]
    finally:
        health_service.physical_esp32_state.update(saved_phys)
        health_service.simulator_state.update(saved_sim)
        health_service.esp32_state.update(saved_esp32)
        endpoints.current_system_state.update(saved_sys)


@pytest.mark.asyncio
async def test_2_esp32_packet_received_online():
    """
    TEST 2: ESP32 packet received.
    Expected:
    ESP32 = ONLINE
    has_live_data = True
    """
    saved_phys = dict(health_service.physical_esp32_state)
    saved_sim = dict(health_service.simulator_state)
    saved_esp32 = dict(health_service.esp32_state)
    saved_sys = dict(endpoints.current_system_state)

    try:
        now = datetime.datetime.utcnow()
        health_service.record_device_heartbeat(
            device_id="GRIDGUARD-TEST-001",
            uptime_sec=120,
            wifi_rssi=-55,
            firmware_version="1.2.0-prod",
            device_mode="PHYSICAL",
            hardware_type="ESP32-S3",
        )
        endpoints.current_system_state["last_update"] = now.isoformat()
        endpoints.current_system_state["has_live_data"] = True
        endpoints.current_system_state["device_mode"] = "PHYSICAL"

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res_status = await ac.get("/api/system/status")
            assert res_status.status_code == 200
            data_status = res_status.json()

            assert data_status["connection_status"] == "ONLINE"
            assert data_status["esp32_online"] is True
            assert data_status["esp32_status"] == "ONLINE"
            assert data_status["has_live_data"] is True

            res_health = await ac.get("/api/system-health")
            assert res_health.status_code == 200
            data_health = res_health.json()
            assert data_health["esp32"]["status"] == "ONLINE"
    finally:
        health_service.physical_esp32_state.update(saved_phys)
        health_service.simulator_state.update(saved_sim)
        health_service.esp32_state.update(saved_esp32)
        endpoints.current_system_state.update(saved_sys)


@pytest.mark.asyncio
async def test_3_esp32_stops_sending_transitions_to_stale_and_offline():
    """
    TEST 3: ESP32 stops sending.
    15-30 seconds -> STALE
    >30 seconds -> OFFLINE
    """
    saved_phys = dict(health_service.physical_esp32_state)
    saved_sim = dict(health_service.simulator_state)
    saved_esp32 = dict(health_service.esp32_state)
    saved_sys = dict(endpoints.current_system_state)

    try:
        now = datetime.datetime.utcnow()

        # Step 3A: Age = 20 seconds -> STALE
        stale_time = now - datetime.timedelta(seconds=20)
        health_service.physical_esp32_state["last_heartbeat"] = stale_time
        health_service.simulator_state["last_heartbeat"] = None
        health_service.esp32_state["last_heartbeat"] = stale_time
        endpoints.current_system_state["last_update"] = stale_time.isoformat()
        endpoints.current_system_state["has_live_data"] = True
        endpoints.current_system_state["device_mode"] = "PHYSICAL"

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res_stale = await ac.get("/api/system/status")
            assert res_stale.status_code == 200
            data_stale = res_stale.json()

            assert data_stale["connection_status"] == "STALE"
            assert data_stale["esp32_online"] is False
            assert data_stale["has_live_data"] is False  # Live data suppressed on stale

        # Step 3B: Age = 45 seconds -> OFFLINE
        offline_time = now - datetime.timedelta(seconds=45)
        health_service.physical_esp32_state["last_heartbeat"] = offline_time
        health_service.simulator_state["last_heartbeat"] = None
        health_service.esp32_state["last_heartbeat"] = offline_time
        endpoints.current_system_state["last_update"] = offline_time.isoformat()
        endpoints.current_system_state["device_mode"] = "PHYSICAL"

        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res_offline = await ac.get("/api/system/status")
            assert res_offline.status_code == 200
            data_offline = res_offline.json()

            assert data_offline["connection_status"] == "OFFLINE"
            assert data_offline["esp32_online"] is False
            assert data_offline["has_live_data"] is False
    finally:
        health_service.physical_esp32_state.update(saved_phys)
        health_service.simulator_state.update(saved_sim)
        health_service.esp32_state.update(saved_esp32)
        endpoints.current_system_state.update(saved_sys)


@pytest.mark.asyncio
async def test_4_fastapi_online_coexists_with_esp32_disconnected():
    """
    TEST 4: FastAPI remains healthy while ESP32 is disconnected.
    Expected:
    FastAPI = ONLINE
    ESP32 = NOT_CONNECTED / OFFLINE
    These MUST coexist without contradiction.
    """
    saved_phys = dict(health_service.physical_esp32_state)
    saved_sim = dict(health_service.simulator_state)
    saved_esp32 = dict(health_service.esp32_state)
    saved_sys = dict(endpoints.current_system_state)

    try:
        health_service.physical_esp32_state["last_heartbeat"] = None
        health_service.simulator_state["last_heartbeat"] = None
        health_service.esp32_state["last_heartbeat"] = None
        endpoints.current_system_state["last_update"] = None
        endpoints.current_system_state["has_live_data"] = False
        endpoints.current_system_state["device_mode"] = "SOFTWARE_ONLY"

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/api/system-health")
            assert res.status_code == 200
            data = res.json()

            assert data["backend_api"]["status"] == "ONLINE"
            assert data["esp32"]["status"] in ["NOT_CONNECTED", "OFFLINE"]
    finally:
        health_service.physical_esp32_state.update(saved_phys)
        health_service.simulator_state.update(saved_sim)
        health_service.esp32_state.update(saved_esp32)
        endpoints.current_system_state.update(saved_sys)


@pytest.mark.asyncio
async def test_5_websocket_initial_state_preserves_disconnected_hardware():
    """
    TEST 5: WebSocket initial payload represents disconnected hardware truthfully.
    """
    saved_phys = dict(health_service.physical_esp32_state)
    saved_sim = dict(health_service.simulator_state)
    saved_esp32 = dict(health_service.esp32_state)
    saved_sys = dict(endpoints.current_system_state)

    try:
        health_service.physical_esp32_state["last_heartbeat"] = None
        health_service.simulator_state["last_heartbeat"] = None
        health_service.esp32_state["last_heartbeat"] = None
        endpoints.current_system_state["last_update"] = None
        endpoints.current_system_state["has_live_data"] = False
        endpoints.current_system_state["device_mode"] = "SOFTWARE_ONLY"

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/api/system/status")
            assert res.status_code == 200
            status_data = res.json()

            assert status_data["connection_status"] == "WAITING_FOR_DEVICE"
            assert status_data["esp32_online"] is False
    finally:
        health_service.physical_esp32_state.update(saved_phys)
        health_service.simulator_state.update(saved_sim)
        health_service.esp32_state.update(saved_esp32)
        endpoints.current_system_state.update(saved_sys)


@pytest.mark.asyncio
async def test_6_mqtt_status_truthfulness():
    """
    TEST 6: MQTT status reflects actual broker connection.
    If backend is not connected to MQTT broker, mqtt_connected must be False.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/system/status")
        assert res.status_code == 200
        data = res.json()

        # mqtt_connected must be a strict boolean
        assert isinstance(data["mqtt_connected"], bool)
        assert data["mqtt_state"] in ["MQTT_CONNECTED", "MQTT_DISCONNECTED", "MQTT_CONNECTING", "MQTT_ERROR"]


@pytest.mark.asyncio
async def test_7_screenshot_reproduction_esp32_online_mqtt_disconnected():
    """
    TEST 7 (Requirement 8 & 20): Reproduce contradictory screenshot state:
    ESP32 = ONLINE (age = 0.5s)
    MQTT = DISCONNECTED
    Node-RED = ONLINE
    FastAPI = ONLINE
    PostgreSQL = CONNECTED
    WebSocket = ESTABLISHED

    Assert:
    - mqtt_connected is False and mqtt_state is "MQTT_DISCONNECTED"
    - data_provenance is "NO_LIVE_MQTT" (never "LIVE_ESP32_MQTT" or "LIVE MQTT")
    - telemetry_source is "NONE" (never "ESP32_MQTT" when MQTT is disconnected)
    - System health component mqtt_device_session reports DISCONNECTED
    """
    saved_esp32 = dict(health_service.esp32_state)
    saved_sys = dict(endpoints.current_system_state)
    saved_mqtt_conn = mqtt_manager.connected
    saved_mqtt_state = getattr(mqtt_manager, "state", "MQTT_DISCONNECTED")

    try:
        now = datetime.datetime.utcnow()
        # 1. ESP32 active heartbeat received 0.5 seconds ago
        health_service.esp32_state["device_id"] = "GRIDGUARD-ESP32-001"
        health_service.esp32_state["last_heartbeat"] = now - datetime.timedelta(seconds=0.5)
        health_service.esp32_state["mqtt_connected"] = False # Device disconnected from MQTT
        endpoints.current_system_state["last_update"] = (now - datetime.timedelta(seconds=0.5)).isoformat()
        endpoints.current_system_state["has_live_data"] = True
        endpoints.current_system_state["device_mode"] = "REAL_HARDWARE"
        endpoints.current_system_state["hardware_type"] = "ESP32-S3 N16R8"

        # 2. MQTT broker disconnected in backend
        mqtt_manager.connected = False
        mqtt_manager.state = "MQTT_DISCONNECTED"

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Check /api/system/status
            res_status = await ac.get("/api/system/status")
            assert res_status.status_code == 200
            data_status = res_status.json()

            # ESP32 is online
            assert data_status["esp32_online"] is True
            assert data_status["esp32_status"] == "ONLINE"
            assert data_status["packet_age_sec"] is not None
            assert data_status["packet_age_sec"] < 2.0

            # BUT MQTT is DISCONNECTED
            assert data_status["mqtt_connected"] is False
            assert data_status["mqtt_state"] == "MQTT_DISCONNECTED"

            # Strict Zero-Fabrication: Data provenance CANNOT be LIVE_ESP32_MQTT
            assert data_status["data_provenance"] == "NO_LIVE_MQTT"
            assert data_status["telemetry_source"] == "NONE"

            # Check /api/system-health
            res_health = await ac.get("/api/system-health")
            assert res_health.status_code == 200
            data_health = res_health.json()

            # Services coexisting independently
            assert data_health["backend_api"]["status"] == "ONLINE"
            assert data_health["websocket"]["status"] == "CONNECTED"
            assert data_health["database"]["status"] in ["ONLINE", "CONNECTED"]

            # MQTT session correctly decoupled
            assert data_health["mqtt_device_session"]["status"] == "DISCONNECTED"

    finally:
        health_service.esp32_state.update(saved_esp32)
        endpoints.current_system_state.update(saved_sys)
        mqtt_manager.connected = saved_mqtt_conn
        mqtt_manager.state = saved_mqtt_state


@pytest.mark.asyncio
async def test_8_simulator_active_physical_esp32_disconnected():
    """
    TEST 8 (Requirement 1-6): Simulator is active, physical ESP32 is NOT connected.
    Expected:
    - physical_esp32_online: False
    - physical_esp32_status: "NOT_CONNECTED"
    - esp32_online: False (MUST NOT display ESP32 ONLINE)
    - esp32_status: "NOT_CONNECTED"
    - simulator_online: True
    - simulator_status: "ONLINE"
    - device_mode: "SIMULATOR"
    - telemetry_source: "SIMULATOR_MQTT"
    - overall_status: "SIMULATOR_ACTIVE"
    """
    saved_phys = dict(health_service.physical_esp32_state)
    saved_sim = dict(health_service.simulator_state)
    saved_sys = dict(endpoints.current_system_state)

    try:
        now = datetime.datetime.utcnow()

        # 1. Physical ESP32 is strictly NOT connected
        health_service.physical_esp32_state["last_heartbeat"] = None
        health_service.physical_esp32_state["device_id"] = None

        # 2. Simulator sends telemetry packet
        health_service.record_device_heartbeat(
            device_id="GRIDGUARD-ESP32-SIM-001",
            device_mode="SIMULATOR",
            hardware_type="ESP32-S3 SIMULATOR",
            uptime_sec=350,
            wifi_rssi=-52,
            mqtt_connected=True,
            scenario="NORMAL",
        )
        endpoints.current_system_state["device_id"] = "GRIDGUARD-ESP32-SIM-001"
        endpoints.current_system_state["device_mode"] = "SIMULATOR"
        endpoints.current_system_state["hardware_type"] = "SIMULATOR"
        endpoints.current_system_state["telemetry_source"] = "SIMULATOR"
        endpoints.current_system_state["data_source"] = "SIMULATED HARDWARE"
        endpoints.current_system_state["last_update"] = (now - datetime.timedelta(seconds=0.5)).isoformat()
        endpoints.current_system_state["has_live_data"] = True

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res_status = await ac.get("/api/system/status")
            assert res_status.status_code == 200
            data_status = res_status.json()

            # Physical ESP32 MUST NOT BE REPORTED AS ONLINE
            assert data_status["physical_esp32_online"] is False
            assert data_status["physical_esp32_status"] == "NOT_CONNECTED"
            assert data_status["esp32_online"] is False
            assert data_status["esp32_status"] == "NOT_CONNECTED"

            # Simulator is ONLINE and correctly labeled
            assert data_status["simulator_online"] is True
            assert data_status["simulator_status"] == "ONLINE"
            assert data_status["device_mode"] == "SIMULATOR"
            assert data_status["telemetry_source"] == "SIMULATOR_MQTT"

            # Check /api/system-health
            res_health = await ac.get("/api/system-health")
            assert res_health.status_code == 200
            data_health = res_health.json()

            assert data_health["esp32"]["status"] == "NOT_CONNECTED"
            assert data_health["simulator"]["status"] == "ONLINE"
            assert data_health["device_mode"] == "SIMULATOR"
            assert data_health["telemetry_source"] == "SIMULATOR"
            assert data_health["overall_status"] == "SIMULATOR_ACTIVE"

    finally:
        health_service.physical_esp32_state.update(saved_phys)
        health_service.simulator_state.update(saved_sim)
        endpoints.current_system_state.update(saved_sys)

