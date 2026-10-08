import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from backend.app.main import app

@pytest.mark.asyncio
async def test_root_and_system_status():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/system/status")
        assert res.status_code == 200
        data = res.json()
        assert "system_state" in data
        assert "telemetry" in data
        telemetry = data["telemetry"]
        assert "voltage" in telemetry
        assert "current" in telemetry
        assert "power" in telemetry
        assert "frequency" in telemetry
        assert "power_factor" in telemetry
        # STRICT ZERO TEMPERATURE TEST
        assert "temperature" not in telemetry
        assert "temp" not in telemetry

@pytest.mark.asyncio
async def test_channels_apparent_power_and_no_temperature():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/channels")
        assert res.status_code == 200
        channels = res.json()
        assert len(channels) == 4
        for ch in channels:
            assert "apparent_power" in ch
            assert "main_relay" in ch
            assert "aux_relay" in ch
            assert "relay_feedback_available" in ch
            # STRICT ZERO TEMPERATURE TEST
            assert "temperature" not in ch
            assert "temp" not in ch

@pytest.mark.asyncio
async def test_forecasting_and_risk():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res_fc = await ac.get("/api/predictions")
        assert res_fc.status_code == 200
        fc = res_fc.json()
        assert "forecast_15m" in fc
        assert "forecast_30m" in fc
        assert "forecast_60m" in fc

        res_risk = await ac.get("/api/risk")
        assert res_risk.status_code == 200
        risks = res_risk.json()
        assert len(risks) == 4

@pytest.mark.asyncio
async def test_face_auth_reset_workflow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "channel": 1,
            "reset_request": True,
            "authentication_result": True,
            "authorized_identity": "Lead Electrical Engineer",
            "face_confidence": 0.96,
            "client_timestamp": "2026-09-18T13:17:00Z"
        }
        res = await ac.post("/api/relays/reset-face-auth", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["status"] == "SAFETY_CHECK_PASSED"

@pytest.mark.asyncio
async def test_demo_scenario_propagation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.post("/api/demo/scenario", json={"scenario": "OVERCURRENT", "channel": 2})
        assert res.status_code == 200
        demo_res = await ac.get("/api/demo/status")
        assert demo_res.status_code == 200
        demo_data = demo_res.json()
        ch2 = next(c for c in demo_data["channels"] if c["channel"] == 2)
        assert ch2["status"] == "FAULT LATCHED"
        assert ch2["load_active"] is False

        # Verify live channels remain strictly isolated from demo mode
        live_res = await ac.get("/api/channels/2")
        assert live_res.status_code == 200
        live_ch2 = live_res.json()
        assert live_ch2["data_source"] != "SIMULATED DEMO"

        # Reset back to NORMAL
        reset_res = await ac.post("/api/demo/scenario", json={"scenario": "NORMAL"})
        assert reset_res.status_code == 200


@pytest.mark.asyncio
async def test_node_red_telemetry_ingestion():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Deliberate rogue temperature must be REJECTED with 422
        bad_sys_payload = {
            "voltage": 231.2,
            "current": 4.10,
            "power": 925.0,
            "energy": 2.45,
            "frequency": 50.05,
            "power_factor": 0.96,
            "temperature": 45.0 # Prohibited temperature field
        }
        res_bad = await ac.post("/api/telemetry/system", json=bad_sys_payload)
        assert res_bad.status_code == 422

        # 2. Clean system telemetry ingestion
        clean_sys_payload = {
            "voltage": 231.2,
            "current": 4.10,
            "power": 925.0,
            "energy": 2.45,
            "frequency": 50.05,
            "power_factor": 0.96
        }
        res_sys = await ac.post("/api/telemetry/system", json=clean_sys_payload)
        assert res_sys.status_code == 200

        res_check = await ac.get("/api/system/status")
        assert res_check.status_code == 200
        data = res_check.json()
        assert "temperature" not in data["telemetry"]
        assert data["has_live_data"] is True

        # 3. Rogue channel temperature must be rejected with 422
        bad_ch_payload = {
            "channel": 3,
            "voltage": 229.5,
            "current": 1.40,
            "temperature": 50.0 # Prohibited temperature field
        }
        res_bad_ch = await ac.post("/api/telemetry/channels", json=bad_ch_payload)
        assert res_bad_ch.status_code == 422

        # 4. Clean channel telemetry ingestion
        clean_ch_payload = {
            "channel": 3,
            "voltage": 229.5,
            "current": 1.40
        }
        res_ch = await ac.post("/api/telemetry/channels", json=clean_ch_payload)
        assert res_ch.status_code == 200
        ch_data = res_ch.json()
        assert ch_data["channel"] == 3
        assert "temperature" not in ch_data

@pytest.mark.asyncio
async def test_calibration_and_quality_monitoring():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Fetch live calibration status for all 4 channels
        res = await ac.get("/api/calibration")
        assert res.status_code == 200
        cal_list = res.json()
        assert len(cal_list) == 4
        for ch_cal in cal_list:
            assert "channel" in ch_cal
            assert "raw_voltage" in ch_cal
            assert "calibrated_voltage" in ch_cal
            assert "reference_voltage" in ch_cal
            assert "voltage_error_pct" in ch_cal
            assert "sensor_quality" in ch_cal
            assert ch_cal["sensor_quality"] in ["GOOD", "WARNING", "BAD", "OFFLINE"]
            assert "temperature" not in ch_cal

        # 2. Update calibration for Channel 2
        update_payload = {
            "channel": 2,
            "voltage_scale": 1.012,
            "voltage_offset": -0.5,
            "current_scale": 0.995,
            "current_offset": 0.02,
            "zero_current_raw": 2046.0,
            "reference_voltage": 230.0,
            "reference_current": 1.35,
            "calibrated_by": "Senior Protection Engineer"
        }
        res_update = await ac.post("/api/calibration", json=update_payload)
        assert res_update.status_code == 200
        assert res_update.json()["success"] is True

        # 3. Test Zero-Current offset calibration for ACS712
        res_zero = await ac.post("/api/calibration/zero-current", json={"channel": 2, "zero_raw": 2047.5})
        assert res_zero.status_code == 200
        assert res_zero.json()["success"] is True
        assert res_zero.json()["zero_current_raw"] == 2047.5

@pytest.mark.asyncio
async def test_event_timeline_and_latency_benchmarks():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Event Timeline (Section 35)
        res_tl = await ac.get("/api/events/timeline?limit=25")
        assert res_tl.status_code == 200
        timeline = res_tl.json()
        assert isinstance(timeline, list)
        assert len(timeline) > 0
        first_evt = timeline[0]
        assert "id" in first_evt
        assert "timestamp" in first_evt
        assert "level" in first_evt
        assert "source" in first_evt
        assert "description" in first_evt

        # 2. Latency Benchmarks (Section 49)
        res_bench = await ac.get("/api/benchmarks/latency")
        assert res_bench.status_code == 200
        bench_data = res_bench.json()
        assert bench_data["protection_domain_independent"] is True
        assert bench_data["overall_status"] in ["ALL_TARGETS_PASSED", "DEGRADED"]
        # Confirm ESP32 local protection loop latency is < 10ms
        benchmarks = {b["subsystem"]: b for b in bench_data["benchmarks"]}
        assert "Protection Decision Loop" in benchmarks
        assert benchmarks["Protection Decision Loop"]["measured_ms"] < 10.0
        assert benchmarks["Protection Decision Loop"]["pass_fail"] == "PASS"


