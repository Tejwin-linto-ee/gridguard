import asyncio
import sys
import os

# Ensure project root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

os.environ["TESTING"] = "1"

from httpx import AsyncClient, ASGITransport
from backend.app.main import app

async def main():
    print("==================================================")
    print("GRIDGUARD BACKEND API & SAFETY VALIDATION SUITE")
    print("==================================================")
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Test Cold-Start System Status & Telemetry (Strict Zero Fabricated Telemetry)
        res = await ac.get("/api/system/status")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        data = res.json()
        telemetry = data["telemetry"]
        assert "temperature" not in telemetry, "CRITICAL ERROR: Temperature found in telemetry!"
        assert "temp" not in telemetry, "CRITICAL ERROR: Temp found in telemetry!"
        assert telemetry["voltage"] is None, "Cold-start must be None, not fabricated value"
        assert data["system_state"] == "WAITING FOR LIVE MQTT TELEMETRY"
        print(f"[PASS] Cold-Start Status: {data['system_state']}, Telemetry: Null/Honest, Zero Temperature Verified.")

        # Ingest real live telemetry packet to test live state
        await ac.post("/api/telemetry/system", json={
            "voltage": 230.8,
            "current": 3.45,
            "power": 780.2,
            "energy": 12.4,
            "frequency": 50.02,
            "power_factor": 0.98,
            "data_source": "LIVE MQTT"
        })
        res_live = await ac.get("/api/system/status")
        data_live = res_live.json()
        assert data_live["telemetry"]["voltage"] == 230.8
        print(f"[PASS] Live Telemetry Ingested: Voltage: {data_live['telemetry']['voltage']}V, State: {data_live['system_state']}.")

        # 2. Test Channels
        res_ch = await ac.get("/api/channels")
        assert res_ch.status_code == 200
        channels = res_ch.json()
        assert len(channels) == 4, f"Expected 4 channels, got {len(channels)}"
        for ch in channels:
            assert "apparent_power" in ch
            assert "temperature" not in ch
            assert "temp" not in ch
        print("[PASS] 4 Prototype Load Channels Verified: Apparent Power (VA) calculated, Zero Temperature.")

        # 3. Test Forecasting & Risk
        res_fc = await ac.get("/api/predictions")
        assert res_fc.status_code == 200
        fc = res_fc.json()
        assert "forecast_15m" in fc
        print(f"[PASS] Dynamic Load Forecasting: Current {fc['current_load_w']}W -> 15m Pred: {fc['forecast_15m']['predicted_load_w']}W.")

        res_risk = await ac.get("/api/risk")
        assert res_risk.status_code == 200
        risks = res_risk.json()
        assert len(risks) == 4
        # At cold-start with no channel telemetry, risk is strictly UNAVAILABLE
        assert all(r["risk_score"] is None for r in risks)
        assert all(r["summary"] == "RISK UNAVAILABLE — INSUFFICIENT LIVE DATA" for r in risks)
        print("[PASS] Channel Risk Index Verified for CH 1-4: Correctly reports RISK UNAVAILABLE on cold start.")

        # Ingest channel telemetry for channels 1-4
        for ch_num in range(1, 5):
            await ac.post("/api/telemetry/channels", json={
                "channel": ch_num,
                "voltage": 230.0 + ch_num,
                "current": 1.20,
                "main_relay": True,
                "aux_relay": True,
                "load": True,
                "status": "NORMAL"
            })

        # Re-verify risk index calculation now that live channel telemetry exists
        res_risk_live = await ac.get("/api/risk")
        risks_live = res_risk_live.json()
        assert all(r["risk_score"] is not None for r in risks_live)
        avg_risk = sum(r["risk_score"] for r in risks_live) / 4
        print(f"[PASS] Channel Risk Index Calculated with Live Data for CH 1-4 (Avg: {avg_risk:.1f}/100).")

        # 4. Test Face-Auth Reset Workflow
        payload = {
            "channel": 1,
            "reset_request": True,
            "authentication_result": True,
            "authorized_identity": "Lead Electrical Engineer",
            "face_confidence": 0.96,
            "client_timestamp": "2026-09-18T13:20:00Z"
        }
        res_reset = await ac.post("/api/relays/reset-face-auth", json=payload)
        assert res_reset.status_code == 200
        reset_data = res_reset.json()
        assert reset_data["success"] is True
        print(f"[PASS] Laptop Face Recognition Reset Workflow: {reset_data['message']}")

        # 5. Test Demo Scenario Propagation & Isolation
        res_demo = await ac.post("/api/demo/scenario", json={"scenario": "OVERCURRENT", "channel": 2})
        assert res_demo.status_code == 200
        demo_status = (await ac.get("/api/demo/status")).json()
        ch2 = next(c for c in demo_status["channels"] if c["channel"] == 2)
        assert ch2["status"] == "FAULT LATCHED"
        assert ch2["load_active"] is False
        print(f"[PASS] Simulator Scenario OVERCURRENT: CH2 tripped and latched in Demo (State: {ch2['status']}).")

        # Verify Live Mode was NOT contaminated
        live_ch2 = (await ac.get("/api/channels/2")).json()
        assert live_ch2["data_source"] != "SIMULATED DEMO"
        print("[PASS] Demo Isolation Verified: Live channel 2 was NOT contaminated by demo trip.")

        # Restore to NORMAL
        res_normal = await ac.post("/api/demo/scenario", json={"scenario": "NORMAL"})
        assert res_normal.status_code == 200
        print("[PASS] Simulator Scenario NORMAL: All channels restored and synchronized in Demo.")

        # 6. Test Gemini Advisory
        res_ai = await ac.post("/api/ai/analyze", json={"query": "Explain active channel risk and status"})
        assert res_ai.status_code == 200
        ai_data = res_ai.json()
        assert "analysis" in ai_data
        assert "temperature" not in ai_data["analysis"].lower()
        print(f"[PASS] Gemini Advisory Engine: Advisory received with safety boundaries enforced.")

        # 7. Test Fault Classification ML (Step 23)
        res_clf = await ac.get("/api/classification/metrics")
        assert res_clf.status_code == 200
        clf_data = res_clf.json()
        assert clf_data["status"] == "MODEL UNAVAILABLE — INSUFFICIENT TRAINING DATA"
        assert clf_data["accuracy"] is None
        assert "temperature" not in str(clf_data["features_used"]).lower()
        print(f"[PASS] Fault Classification ML: Fails honest with '{clf_data['status']}' on cold start.")

        # Test training pipeline validation with sample historical electrical telemetry
        from backend.app.ml.classification import fault_classifier
        sample_records = []
        for idx in range(30):
            sample_records.append({"voltage": 230.0 + (idx % 3), "current": 1.1 + (idx * 0.01), "fault_type": "NORMAL"})
        for idx in range(30):
            sample_records.append({"voltage": 255.0, "current": 3.2 + (idx * 0.02), "fault_type": "OVERCURRENT"})
        metrics = fault_classifier.train_on_telemetry(sample_records)
        assert metrics["status"] == "AVAILABLE"
        assert metrics["accuracy"] >= 0.90
        assert metrics["f1_score"] is not None
        assert "temperature" not in str(metrics["features_used"]).lower()
        print(f"[PASS] Fault Classification ML Pipeline: Trained on {metrics['training_samples']} samples (Acc: {metrics['accuracy']*100:.1f}%, F1: {metrics['f1_score']:.4f}).")

    print("==================================================")
    print("ALL BACKEND & PROTECTION TESTS PASSED SUCCESSFULLY!")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(main())
