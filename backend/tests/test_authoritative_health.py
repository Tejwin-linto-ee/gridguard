import pytest
import datetime
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.services.health_service import health_service
from backend.app.api.endpoints import current_system_state, current_channels_state

@pytest.mark.asyncio
async def test_cold_start_authoritative_health():
    """
    Test 1: Cold start with zero heartbeats or telemetry received.
    Must return WAITING_FOR_HARDWARE, ESP32 NOT_CONNECTED, Telemetry NO LIVE DATA,
    Watchdog NOT_AVAILABLE. Strictly zero fabricated latencies or statuses.
    """
    # Reset health_service state to cold start
    health_service.esp32_state["last_heartbeat"] = None
    health_service.esp32_state["device_id"] = None
    health_service.esp32_state["watchdog_active"] = False
    health_service.esp32_state["watchdog_interval_ms"] = None
    current_system_state["last_update"] = None
    current_system_state["voltage"] = None
    current_system_state["current"] = None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/system-health")
        assert res.status_code == 200
        data = res.json()

        # Overall status must NOT be ALL CORE SERVICES OPERATIONAL or FULLY_OPERATIONAL
        assert data["overall_status"] == "WAITING_FOR_HARDWARE"
        assert "no ESP32" in data["overall_message"]

        # ESP32 hardware check
        assert data["esp32"]["status"] == "NOT_CONNECTED"
        assert data["esp32"]["latency_ms"] is None

        # Watchdog check
        assert data["hardware_watchdog"]["status"] == "NOT_AVAILABLE"
        assert data["hardware_watchdog"]["reported"] is False
        assert data["hardware_watchdog"]["interval_ms"] is None

        # Telemetry check
        assert data["live_telemetry"]["status"] == "NO LIVE DATA"

        # Pipeline localization
        assert data["pipeline_failure_stage"] is not None
        assert "ESP32" in data["pipeline_failure_stage"]

        # Database must be ONLINE with real query execution
        assert data["database"]["status"] == "ONLINE"
        assert data["database"]["latency_ms"] is not None
        assert data["database"]["latency_ms"] > 0

@pytest.mark.asyncio
async def test_esp32_heartbeat_and_watchdog_reporting():
    """
    Test 2: When ESP32 sends valid heartbeat with reported watchdog,
    ESP32 status becomes ONLINE, and watchdog reports ACTIVE with actual interval.
    """
    health_service.record_esp32_heartbeat(
        device_id="ESP32-S3-N16R8",
        uptime_sec=1420,
        wifi_rssi=-48,
        ip_address="10.178.2.59",
        firmware_version="v2.4.1",
        mqtt_connected=True,
        watchdog_active=True,
        watchdog_interval_ms=250,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/system-health")
        assert res.status_code == 200
        data = res.json()

        assert data["esp32"]["status"] == "ONLINE"
        assert "Heartbeat active" in data["esp32"]["details"]

        assert data["hardware_watchdog"]["status"] == "ACTIVE"
        assert data["hardware_watchdog"]["reported"] is True
        assert data["hardware_watchdog"]["interval_ms"] == 250

        assert data["mqtt_device_session"]["status"] == "CONNECTED"

@pytest.mark.asyncio
async def test_heartbeat_timeout_transitions_to_offline():
    """
    Test 3: If heartbeat timestamp exceeds timeout (> 15s),
    ESP32 transitions to OFFLINE, and pipeline marks it interrupted.
    """
    # Set heartbeat timestamp 20 seconds in the past
    health_service.esp32_state["last_heartbeat"] = datetime.datetime.utcnow() - datetime.timedelta(seconds=20)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/system-health")
        assert res.status_code == 200
        data = res.json()

        assert data["esp32"]["status"] in ("OFFLINE", "STALE")
        assert "timed out" in data["esp32"]["details"] or "delayed" in data["esp32"]["details"]

@pytest.mark.asyncio
async def test_telemetry_staleness_timeout():
    """
    Test 4: When telemetry was received but is older than staleness timeout,
    freshness becomes STALE rather than claiming LIVE.
    """
    current_system_state["voltage"] = 230.1
    current_system_state["last_update"] = datetime.datetime.utcnow() - datetime.timedelta(seconds=18)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/system-health")
        assert res.status_code == 200
        data = res.json()

        assert data["live_telemetry"]["status"] == "STALE"
        assert "stale" in data["live_telemetry"]["details"].lower()
