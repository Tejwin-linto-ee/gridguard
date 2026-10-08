import asyncio
import json
import websockets

async def test_ws():
    uri = "ws://127.0.0.1:8000/ws/live"
    print(f"Connecting to WebSocket: {uri}...")
    async with websockets.connect(uri) as ws:
        print("WebSocket connected successfully!")
        
        # Receive INITIAL_STATE
        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(msg)
        print("Received initial packet type:", data.get("type"))
        sys = data.get("system", {})
        print("Initial voltage is None:", sys.get("voltage") is None)
        print("Initial has_live_data is False:", data.get("has_live_data") is False or sys.get("has_live_data") is False)
        print("System state:", data.get("system_state"))
        
        assert sys.get("voltage") is None, "Initial voltage must be null, not fabricated!"
        assert data.get("system_state") == "WAITING FOR LIVE MQTT TELEMETRY"
        print("[PASS] WebSocket Cold Connection Contract Verified: Initial electrical metrics are null.")

if __name__ == "__main__":
    asyncio.run(test_ws())
