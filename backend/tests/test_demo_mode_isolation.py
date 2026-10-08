import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.api.endpoints import handle_mqtt_telemetry, current_system_state, demo_channels_state, demo_current_state

@pytest.mark.asyncio
async def test_demo_status_and_isolation_from_live():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Fetch demo status
        res = await ac.get("/api/demo/status")
        assert res.status_code == 200
        data = res.json()
        assert data["data_source"] == "SIMULATED DEMO"
        assert len(data["channels"]) == 4
        assert "demo_state" in data
        assert "timeline" in data

        # 2. Inject overcurrent fault on Channel 2 in demo
        res_action = await ac.post("/api/demo/action", json={"action": "OVERCURRENT", "channel": 2})
        assert res_action.status_code == 200
        action_data = res_action.json()
        assert action_data["demo_state"] == "DEMO_FAULT_LATCHED"
        ch2 = next(c for c in action_data["channels"] if c["channel"] == 2)
        assert ch2["status"] == "FAULT LATCHED"
        assert ch2["main_relay"] is False
        assert ch2["aux_relay"] is False
        assert ch2["load_active"] is False

        # Verify live telemetry was NOT contaminated by the demo trip
        # (current_system_state is isolated)
        assert current_system_state["data_source"] != "SIMULATED DEMO"

        # 3. Execute demo reset
        res_reset = await ac.post("/api/demo/reset", json={"operator_name": "Test Operator"})
        assert res_reset.status_code == 200
        reset_data = res_reset.json()
        assert reset_data["status"] == "DEMO_RESET_SUCCESSFUL"
        assert reset_data["demo_state"] == "DEMO_NORMAL"
        ch2_restored = next(c for c in reset_data["channels"] if c["channel"] == 2)
        assert ch2_restored["status"] == "NORMAL"
        assert ch2_restored["main_relay"] is True
        assert ch2_restored["aux_relay"] is True

        # 4. Ingest live MQTT telemetry packet
        raw_telemetry = {
            "voltage": 232.1,
            "current": 1.45,
            "power": 336.5,
            "energy": 12.450,
            "frequency": 50.02,
            "power_factor": 0.96,
            "channel_1_voltage": 231.8,
            "channel_1_current": 0.42,
            "channel_2_voltage": 232.0,
            "channel_2_current": 0.51,
            "channel_3_voltage": 231.9,
            "channel_3_current": 0.38,
            "channel_4_voltage": 232.1,
            "channel_4_current": 0.14,
        }
        await handle_mqtt_telemetry("smarttransformer/system", raw_telemetry)

        # Verify live system state received live telemetry
        assert current_system_state["has_live_data"] is True
        assert current_system_state["voltage"] == 232.1
        assert "LIVE MQTT" in current_system_state["data_source"]
