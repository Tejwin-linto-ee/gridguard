import pytest
import json
import asyncio
from datetime import datetime
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.api.endpoints import current_system_state, current_channels_state
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.models import SystemMeasurement, ChannelMeasurement, DeviceHeartbeat, Device
from sqlalchemy import select

@pytest.fixture(autouse=True)
def reset_live_state():
    """Ensure a clean baseline before and after each test."""
    current_system_state["voltage"] = None
    current_system_state["current"] = None
    current_system_state["power"] = None
    current_system_state["energy"] = None
    current_system_state["frequency"] = None
    current_system_state["power_factor"] = None
    current_system_state["data_source"] = "NO LIVE DATA"
    current_system_state["has_live_data"] = False
    current_system_state["last_update"] = None
    current_system_state["device_id"] = "ESP32-S3"
    current_system_state["device_status"] = "WAITING FOR LIVE MQTT TELEMETRY"
    current_system_state["device_last_seen"] = None

    from backend.app.services.health_service import health_service
    health_service.physical_esp32_state["last_heartbeat"] = None
    health_service.physical_esp32_state["device_id"] = None
    health_service.simulator_state["last_heartbeat"] = None
    health_service.simulator_state["device_id"] = None
    health_service.esp32_state["last_heartbeat"] = None
    health_service.esp32_state["device_id"] = None

    for ch in range(1, 5):
        current_channels_state[ch]["voltage"] = None
        current_channels_state[ch]["current"] = None
        current_channels_state[ch]["apparent_power"] = None
        current_channels_state[ch]["main_relay"] = None
        current_channels_state[ch]["aux_relay"] = None
        current_channels_state[ch]["load_active"] = None
        current_channels_state[ch]["status"] = "WAITING FOR LIVE MQTT TELEMETRY"
        current_channels_state[ch]["fault"] = None
        current_channels_state[ch]["data_source"] = "NO LIVE DATA"
        current_channels_state[ch]["has_live_data"] = False
        current_channels_state[ch]["last_update"] = None

    yield


# --------------------------------------------------------------------------
# 1. System Telemetry Ingestion (POST /api/telemetry/system)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_step3_system_telemetry_forwarding():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "timestamp": "2026-09-19T00:00:00",
            "voltage": 230.5,
            "current": 1.2,
            "power": 276.6,
            "energy": 0.01,
            "frequency": 50.0,
            "power_factor": 0.98
        }
        res = await ac.post("/api/telemetry/system", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ACK"
        assert data["received"] == "SYSTEM_TELEMETRY"
        assert data["has_live_data"] is True

        # Check DB persistence
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(SystemMeasurement).order_by(SystemMeasurement.id.desc()).limit(1)
            )
            row = result.scalars().first()
            assert row is not None
            assert row.voltage == 230.5
            assert row.current == 1.2
            assert row.power == 276.6
            assert row.energy == 0.01
            assert row.frequency == 50.0
            assert row.power_factor == 0.98


# --------------------------------------------------------------------------
# 2. Channel Telemetry Ingestion (POST /api/telemetry/channels)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_step3_channel_telemetry_forwarding():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "timestamp": "2026-09-19T00:00:00",
            "channel": 1,
            "voltage": 230.2,
            "current": 1.1,
            "main_relay": True,
            "aux_relay": True,
            "load": True,
            "status": "NORMAL",
            "fault": None
        }
        res = await ac.post("/api/telemetry/channels", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ACK"
        assert data["channel"] == 1
        assert data["has_live_data"] is True

        # Check DB persistence
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ChannelMeasurement).filter(ChannelMeasurement.channel == 1).order_by(ChannelMeasurement.id.desc()).limit(1)
            )
            row = result.scalars().first()
            assert row is not None
            assert row.voltage == 230.2
            assert row.current == 1.1
            assert row.main_relay is True
            assert row.aux_relay is True
            assert row.load_active is True
            # Apparent power was computed: 230.2 * 1.1 = 253.22 -> 253.2 VA
            assert row.apparent_power == 253.2


# --------------------------------------------------------------------------
# 3. Channels 1 to 4 Accepted
# --------------------------------------------------------------------------
@pytest.mark.asyncio
@pytest.mark.parametrize("ch_id", [1, 2, 3, 4])
async def test_step3_channels_1_to_4_accepted(ch_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "channel": ch_id,
            "voltage": 230.0,
            "current": 0.5
        }
        res = await ac.post("/api/telemetry/channels", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["channel"] == ch_id
        assert current_channels_state[ch_id]["voltage"] == 230.0
        assert current_channels_state[ch_id]["current"] == 0.5


# --------------------------------------------------------------------------
# 4. Invalid Channels Rejected (0, 5, -1, non-numeric)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
@pytest.mark.parametrize("ch_id", [0, 5, -1, 99])
async def test_step3_invalid_channel_rejected(ch_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "channel": ch_id,
            "voltage": 230.0,
            "current": 0.5
        }
        res = await ac.post("/api/telemetry/channels", json=payload)
        # 422 Unprocessable Entity due to Pydantic ge=1, le=4 constraint
        assert res.status_code == 422


# --------------------------------------------------------------------------
# 5. Missing Metrics Remain Null (Hardware Not Connected Yet)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_step3_missing_metrics_remain_null():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Status-only telemetry packet without voltage/current
        payload = {
            "channel": 2,
            "status": "WAITING FOR LIVE MQTT TELEMETRY",
            "main_relay": False,
            "aux_relay": False
        }
        res = await ac.post("/api/telemetry/channels", json=payload)
        assert res.status_code == 200

        assert current_channels_state[2]["voltage"] is None
        assert current_channels_state[2]["current"] is None
        assert current_channels_state[2]["apparent_power"] is None
        assert current_channels_state[2]["has_live_data"] is False


# --------------------------------------------------------------------------
# 6. Apparent Power Calculation Rule (VA)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_step3_apparent_power_calculation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Both V and I present: apparent_power = V * I
        res = await ac.post("/api/telemetry/channels", json={
            "channel": 3,
            "voltage": 220.0,
            "current": 2.0
        })
        assert res.status_code == 200
        assert current_channels_state[3]["apparent_power"] == 440.0

        # Only V present: apparent_power must remain None
        current_channels_state[3]["voltage"] = None
        current_channels_state[3]["current"] = None
        current_channels_state[3]["apparent_power"] = None

        res2 = await ac.post("/api/telemetry/channels", json={
            "channel": 3,
            "voltage": 220.0
        })
        assert res2.status_code == 200
        assert current_channels_state[3]["apparent_power"] is None


# --------------------------------------------------------------------------
# 7. Strict Zero-Temperature Enforcement (Reject all temp fields)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
@pytest.mark.parametrize("bad_field", ["temperature", "temperature_c", "temp", "thermal", "thermal_status", "temperature_threshold"])
async def test_step3_temperature_fields_rejected_system(bad_field):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "voltage": 230.0,
            bad_field: 45.2
        }
        res = await ac.post("/api/telemetry/system", json=payload)
        assert res.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_field", ["temperature", "temperature_c", "temp", "thermal", "thermal_status", "temperature_threshold"])
async def test_step3_temperature_fields_rejected_channel(bad_field):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "channel": 1,
            "voltage": 230.0,
            bad_field: 45.2
        }
        res = await ac.post("/api/telemetry/channels", json=payload)
        assert res.status_code == 422


# --------------------------------------------------------------------------
# 8. Cold Start Baseline (No Fallback 230/0/50/NORMAL)
# --------------------------------------------------------------------------
def test_step3_cold_start_baseline_no_fabricated_fallbacks():
    # Initial state should show WAITING FOR LIVE MQTT TELEMETRY or NO LIVE DATA
    assert current_system_state["voltage"] is None
    assert current_system_state["current"] is None
    assert current_system_state["frequency"] is None
    assert current_system_state["power"] is None
    assert current_system_state["data_source"] == "NO LIVE DATA"
    assert current_system_state["has_live_data"] is False

    for ch in range(1, 5):
        assert current_channels_state[ch]["voltage"] is None
        assert current_channels_state[ch]["current"] is None
        assert current_channels_state[ch]["status"] == "WAITING FOR LIVE MQTT TELEMETRY"
        assert current_channels_state[ch]["has_live_data"] is False


# --------------------------------------------------------------------------
# 9. Demo Isolation Check
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_step3_demo_isolation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Ingest live system & channel telemetry
        await ac.post("/api/telemetry/system", json={"voltage": 230.5, "current": 1.2})
        await ac.post("/api/telemetry/channels", json={"channel": 1, "voltage": 230.2, "current": 1.1})

        # Fetch demo status endpoint
        demo_res = await ac.get("/api/demo/status")
        assert demo_res.status_code == 200
        demo_data = demo_res.json()
        assert demo_data["data_source"] == "SIMULATED DEMO"
        assert len(demo_data["channels"]) == 4
        # Live state remains LIVE, demo state remains SIMULATED DEMO
        assert current_system_state["data_source"] != "SIMULATED DEMO"
