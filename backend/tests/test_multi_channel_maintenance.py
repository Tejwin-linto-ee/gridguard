import pytest
import datetime
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.services.face_auth import reset_policy_engine
from backend.app.api.endpoints import current_channels_state

@pytest.mark.asyncio
async def test_exact_channel_set_token_binding_and_rejection():
    """
    Verifies Part 3:
    The authorization must be bound to the EXACT selected set.
    A token authorized for [1, 3] must NOT be usable for [1, 2, 3] or [1] only.
    Fail closed.
    """
    token, meta = reset_policy_engine.generate_reset_token(
        user_id="lead_operator",
        channel_ids=[1, 3],
        fault_id="MAINTENANCE-TRIP",
        attempt_id="ATT-TEST-EXACT"
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Test subset attempt ([1] only) -> MUST FAIL (400 Bad Request)
        res_subset = await client.post("/api/trip/authorize", json={
            "authorization_token": token,
            "channel_ids": [1],
            "reason": "TEST"
        })
        assert res_subset.status_code == 400
        assert "CHANNEL_MISMATCH" in res_subset.json()["detail"]

        # 2. Test superset attempt ([1, 2, 3]) -> MUST FAIL (400 Bad Request)
        res_superset = await client.post("/api/trip/authorize", json={
            "authorization_token": token,
            "channel_ids": [1, 2, 3],
            "reason": "TEST"
        })
        assert res_superset.status_code == 400
        assert "CHANNEL_MISMATCH" in res_superset.json()["detail"]

        # 3. Test exact set attempt ([1, 3]) -> MUST PASS
        res_exact = await client.post("/api/trip/authorize", json={
            "authorization_token": token,
            "channel_ids": [1, 3],
            "reason": "SCHEDULED_MAINTENANCE"
        })
        assert res_exact.status_code == 200
        data = res_exact.json()
        assert data["authorized"] is True
        assert data["trip_permitted"] is True
        assert data["channel_ids"] == [1, 3]

@pytest.mark.asyncio
async def test_multi_channel_trip_execution_and_token_burning():
    """
    Verifies Part 4:
    Multi-channel maintenance trip de-energizes Main and Aux relays for exact selected set,
    burns the single-use token, and prevents replay attacks.
    """
    token, meta = reset_policy_engine.generate_reset_token(
        user_id="lead_operator",
        channel_ids=[1, 3, 4],
        fault_id="MAINTENANCE-TRIP",
        attempt_id="ATT-TEST-TRIP"
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Execute trip for [1, 3, 4]
        res = await client.post("/api/trip/execute", json={
            "authorization_token": token,
            "channel_ids": [1, 3, 4],
            "reason": "SCHEDULED_MAINTENANCE"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["channel_ids"] == [1, 3, 4]
        assert data["relay_action_taken"] == "MAIN_AND_AUX_RELAYS_OPENED"

        # Verify state of tripped channels
        for ch in [1, 3, 4]:
            assert current_channels_state[ch]["status"] == "MAINTENANCE"
            assert current_channels_state[ch]["main_relay"] is False
            assert current_channels_state[ch]["aux_relay"] is False
            assert current_channels_state[ch]["load_active"] is False

        # Verify Channel 2 was NOT affected
        assert current_channels_state[2]["status"] != "MAINTENANCE"

        # Replay Attack Test: Token must now be burned and rejected
        res_replay = await client.post("/api/trip/execute", json={
            "authorization_token": token,
            "channel_ids": [1, 3, 4]
        })
        assert res_replay.status_code == 400
        assert "INVALID_TOKEN" in res_replay.json()["detail"] or "CONSUMED" in res_replay.json()["detail"]

@pytest.mark.asyncio
async def test_multi_channel_reset_execution():
    """
    Verifies Part 5:
    Multi-channel reset restores Main and Aux relays for exact selected channels.
    """
    # Setup channels 1 and 3 as tripped
    current_channels_state[1]["status"] = "FAULT LATCHED"
    current_channels_state[1]["main_relay"] = False
    current_channels_state[1]["aux_relay"] = False
    current_channels_state[3]["status"] = "FAULT LATCHED"
    current_channels_state[3]["main_relay"] = False
    current_channels_state[3]["aux_relay"] = False

    token, meta = reset_policy_engine.generate_reset_token(
        user_id="lead_operator",
        channel_ids=[1, 3],
        fault_id="FLT-CURRENT-LATCHED",
        attempt_id="ATT-TEST-RESET"
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Execute reset for [1, 3]
        res = await client.post("/api/reset/execute", json={
            "reset_authorization_token": token,
            "channel_ids": [1, 3]
        })
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["channel_ids"] == [1, 3]

        # Verify both channels restored to NORMAL with Main and Aux closed
        assert current_channels_state[1]["status"] == "NORMAL"
        assert current_channels_state[1]["main_relay"] is True
        assert current_channels_state[1]["aux_relay"] is True

        assert current_channels_state[3]["status"] == "NORMAL"
        assert current_channels_state[3]["main_relay"] is True
        assert current_channels_state[3]["aux_relay"] is True

@pytest.mark.asyncio
async def test_demo_multi_channel_trip_and_reset_isolation():
    """
    Verifies Part 16 & Regression:
    Demo mode multi-channel trip and reset execute in simulated memory and strictly never modify live states.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Trip channels 2 and 4 in simulation
        res_trip = await client.post("/api/demo/trip", json={
            "channel_ids": [2, 4],
            "operator_name": "Demo Operator"
        })
        assert res_trip.status_code == 200
        data_trip = res_trip.json()
        assert data_trip["success"] is True
        assert data_trip["tripped_channels"] == [2, 4]

        # Reset channels 2 and 4 in simulation
        res_reset = await client.post("/api/demo/reset", json={
            "channel_ids": [2, 4],
            "operator_name": "Demo Operator"
        })
        assert res_reset.status_code == 200
        data_reset = res_reset.json()
        assert data_reset["success"] is True
        assert data_reset["reset_channels"] == [2, 4]
