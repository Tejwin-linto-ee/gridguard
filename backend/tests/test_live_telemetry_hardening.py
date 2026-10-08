import pytest
import json
import asyncio
from datetime import datetime
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.config import settings
from backend.app.mqtt.client import mqtt_manager
from backend.app.api.endpoints import current_system_state, current_channels_state
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.models import SystemMeasurement, ChannelMeasurement, DeviceHeartbeat, Device
from sqlalchemy import select, delete

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
# Test 1: Device Status Ingestion
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_device_status_ingestion():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "device": "ESP32-S3",
            "status": "ONLINE"
        }
        res = await ac.post("/api/telemetry/device-status", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ACK"
        assert data["received"] == "DEVICE_STATUS"
        assert data["device"] == "ESP32-S3"
        assert data["device_status"] == "ONLINE"
        assert "timestamp" in data

        # Verify DB heartbeat record
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(DeviceHeartbeat).filter(DeviceHeartbeat.device_id == "ESP32-S3").order_by(DeviceHeartbeat.timestamp.desc())
            )
            hb = result.scalars().first()
            assert hb is not None
            assert hb.mqtt_connected is True

            # Verify Device table updated
            dev_res = await session.execute(select(Device).filter(Device.device_id == "ESP32-S3"))
            dev = dev_res.scalars().first()
            assert dev is not None
            assert dev.status == "ONLINE"


# --------------------------------------------------------------------------
# Test 2: System Telemetry Ingestion with Real Supplied Values
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_system_telemetry_ingestion_real_values():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "timestamp": "2026-09-18T18:00:00Z",
            "voltage": 230.8,
            "current": 3.45,
            "power": 780.2,
            "energy": 12.4,
            "frequency": 50.02,
            "power_factor": 0.98,
            "data_source": "PZEM-004T_LIVE"
        }
        res = await ac.post("/api/telemetry/system", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ACK"
        assert data["has_live_data"] is True

        # Verify in-memory state updated
        assert current_system_state["voltage"] == 230.8
        assert current_system_state["current"] == 3.45
        assert current_system_state["power"] == 780.2
        assert current_system_state["has_live_data"] is True

        # Verify persisted SystemMeasurement in DB
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(SystemMeasurement).filter(SystemMeasurement.data_source == "PZEM-004T_LIVE").order_by(SystemMeasurement.id.desc())
            )
            meas = result.scalars().first()
            assert meas is not None
            assert meas.voltage == 230.8
            assert meas.current == 3.45
            assert meas.power == 780.2
            assert meas.frequency == 50.02
            assert meas.power_factor == 0.98


# --------------------------------------------------------------------------
# Test 3: Channel Telemetry Ingestion (Channels 1-4)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_channel_telemetry_ingestion():
    async with AsyncSessionLocal() as session:
        await session.execute(delete(ChannelMeasurement))
        await session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        for ch_num in range(1, 5):
            payload = {
                "timestamp": "2026-09-18T18:00:00Z",
                "channel": ch_num,
                "voltage": 230.0 + ch_num,
                "current": 1.20,
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
            assert data["channel"] == ch_num
            assert data["has_live_data"] is True

            # Verify in-memory channel state
            ch_state = current_channels_state[ch_num]
            assert ch_state["voltage"] == 230.0 + ch_num
            assert ch_state["current"] == 1.20
            # Apparent power V x I = (230 + ch_num) * 1.20
            expected_va = round((230.0 + ch_num) * 1.20, 1)
            assert ch_state["apparent_power"] == expected_va
            assert ch_state["has_live_data"] is True

        # Verify DB ChannelMeasurement persistence
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ChannelMeasurement).filter(
                    ChannelMeasurement.channel == 2,
                    ChannelMeasurement.voltage == 232.0
                ).order_by(ChannelMeasurement.id.desc())
            )
            ch_meas = result.scalars().first()
            assert ch_meas is not None
            assert ch_meas.channel == 2
            assert ch_meas.voltage == 232.0


# --------------------------------------------------------------------------
# Test 4: Missing Telemetry Values Remain Null/Missing (No Fabricated 230/0/50)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_missing_telemetry_remains_null():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Send partial payload with only voltage
        payload = {
            "voltage": 228.5
            # current, power, energy, frequency, power_factor intentionally omitted
        }
        res = await ac.post("/api/telemetry/system", json=payload)
        assert res.status_code == 200

        # Verify omitted values are NOT defaulted to 0, 50, 230, etc.
        assert current_system_state["voltage"] == 228.5
        assert current_system_state["current"] is None
        assert current_system_state["power"] is None
        assert current_system_state["frequency"] is None
        assert current_system_state["power_factor"] is None

        # Verify Channel missing metrics remain None
        ch_payload = {
            "channel": 1,
            "status": "OFFLINE"
            # voltage, current omitted
        }
        res_ch = await ac.post("/api/telemetry/channels", json=ch_payload)
        assert res_ch.status_code == 200
        assert current_channels_state[1]["voltage"] is None
        assert current_channels_state[1]["current"] is None
        assert current_channels_state[1]["status"] == "OFFLINE"


# --------------------------------------------------------------------------
# Test 5: Invalid Channel IDs are Rejected (Channels < 1 or > 4)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_invalid_channel_ids_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        for invalid_ch in [0, 5, -1, 99]:
            payload = {
                "channel": invalid_ch,
                "voltage": 230.0,
                "current": 1.0
            }
            res = await ac.post("/api/telemetry/channels", json=payload)
            # Pydantic validation rejects out-of-range channels with 422 Unprocessable Entity
            assert res.status_code == 422


# --------------------------------------------------------------------------
# Test 6: No Synthetic 25-Point or 60-Point Dataset is Generated
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_no_synthetic_measurements_generated():
    # Clear measurements from database
    async with AsyncSessionLocal() as session:
        await session.execute(delete(SystemMeasurement))
        await session.execute(delete(ChannelMeasurement))
        await session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # System measurements query on empty DB
        res_sys = await ac.get("/api/system/measurements")
        assert res_sys.status_code == 200
        sys_rows = res_sys.json()
        assert len(sys_rows) <= 3, "DB query must return actual rows or empty, never synthetic 25/50 fallback points"

        # Channel measurements query on empty DB
        res_ch = await ac.get("/api/channels/1/measurements")
        assert res_ch.status_code == 200
        ch_rows = res_ch.json()
        assert len(ch_rows) <= 3, "DB query must return actual rows or empty, never synthetic 60 fallback sine waves"


# --------------------------------------------------------------------------
# Test 7: Cold-Start Live State Reports WAITING FOR LIVE MQTT TELEMETRY
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_cold_start_reports_waiting_for_live_telemetry():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/system/status")
        assert res.status_code == 200
        data = res.json()
        assert data["has_live_data"] is False
        assert data["system_state"] == "WAITING FOR LIVE MQTT TELEMETRY"
        assert data["telemetry"]["has_live_data"] is False
        assert data["telemetry"]["voltage"] is None

        # Channels check on cold start
        res_ch = await ac.get("/api/channels")
        assert res_ch.status_code == 200
        channels = res_ch.json()
        for ch in channels:
            assert ch["has_live_data"] is False
            assert ch["status"] == "WAITING FOR LIVE MQTT TELEMETRY"
            assert ch["voltage"] is None
            assert ch["current"] is None


# --------------------------------------------------------------------------
# Test 8: WebSocket Broadcasts Actual Ingestion Events
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_websocket_broadcasts_actual_ingestion_events():
    from backend.app.websocket.manager import ws_manager

    received_events = []

    # Mock a connected client
    class MockWebSocket:
        async def accept(self):
            pass

        async def send_text(self, text: str):
            received_events.append(json.loads(text))

    mock_ws = MockWebSocket()
    await ws_manager.connect(mock_ws)

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Broadcast device status
            await ac.post("/api/telemetry/device-status", json={"device": "ESP32-S3", "status": "ONLINE"})
            assert any(e.get("type") == "DEVICE_STATUS" and e.get("device") == "ESP32-S3" for e in received_events)

            # 2. Broadcast system telemetry
            await ac.post("/api/telemetry/system", json={"voltage": 232.1, "current": 2.5})
            assert any(e.get("type") == "SYSTEM_TELEMETRY" for e in received_events)

            # 3. Broadcast channel telemetry
            await ac.post("/api/telemetry/channels", json={"channel": 1, "voltage": 231.0, "current": 0.8})
            assert any(e.get("type") == "CHANNEL_TELEMETRY" and e.get("channel") == 1 for e in received_events)

    finally:
        ws_manager.disconnect(mock_ws)


# --------------------------------------------------------------------------
# Test 9: Strict Temperature Prohibition (Zero Temperature Policy)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_temperature_fields_strictly_prohibited():
    prohibited_keys = [
        "temperature",
        "temperature_c",
        "temp",
        "thermal",
        "thermal_status",
        "temperature_threshold"
    ]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        for bad_key in prohibited_keys:
            # Device status rejects temperature
            res_dev = await ac.post("/api/telemetry/device-status", json={"device": "ESP32-S3", "status": "ONLINE", bad_key: 35.0})
            assert res_dev.status_code == 422, f"Device status should reject {bad_key} with 422"

            # System telemetry rejects temperature
            res_sys = await ac.post("/api/telemetry/system", json={"voltage": 230.0, bad_key: 42.0})
            assert res_sys.status_code == 422, f"System telemetry should reject {bad_key} with 422"

            # Channel telemetry rejects temperature
            res_ch = await ac.post("/api/telemetry/channels", json={"channel": 1, "voltage": 230.0, bad_key: 55.0})
            assert res_ch.status_code == 422, f"Channel telemetry should reject {bad_key} with 422"


# --------------------------------------------------------------------------
# Test 10: FastAPI Does Not Independently Subscribe to HiveMQ in NODERED Mode
# --------------------------------------------------------------------------
def test_fastapi_mqtt_passive_when_nodered_authoritative():
    assert settings.MQTT_AUTHORITATIVE_INGRESS == "NODERED"

    # Verify mqtt_manager is in passive mode and does not spawn an autonomous client loop
    assert mqtt_manager.client is None
    assert mqtt_manager.connected is False

    # Calling start() must early exit without starting worker thread
    mqtt_manager.start()
    assert mqtt_manager.client is None
    assert mqtt_manager.connected is False
