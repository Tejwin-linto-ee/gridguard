import os
import json
import asyncio
import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.config import settings
from backend.app.db.init_db import init_db
from backend.app.api.endpoints import (
    api_router, current_system_state, current_channels_state, handle_mqtt_telemetry
)
from backend.app.api.face_endpoints import face_router
from backend.app.services.load_shedding import load_shedding_service
from backend.app.websocket.manager import ws_manager
from backend.app.mqtt.client import mqtt_manager
from backend.app.services.health_service import health_service

def _to_datetime_safe(val):
    if not val:
        return None
    if isinstance(val, datetime.datetime):
        return val.astimezone(datetime.timezone.utc).replace(tzinfo=None) if val.tzinfo else val
    if isinstance(val, str):
        try:
            dt = datetime.datetime.fromisoformat(val.replace("Z", "+00:00"))
            return dt.astimezone(datetime.timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt
        except Exception:
            return None
    return None

# Background loop to broadcast live telemetry pulses over WebSocket
async def telemetry_broadcast_loop():
    while True:
        try:
            await asyncio.sleep(2.0)
            if ws_manager.active_connections:
                now = datetime.datetime.utcnow()
                has_live = current_system_state.get("has_live_data", False)
                pkt_dt = _to_datetime_safe(current_system_state.get("last_update"))
                phys_dt = _to_datetime_safe(health_service.physical_esp32_state.get("last_heartbeat"))
                sim_dt = _to_datetime_safe(health_service.simulator_state.get("last_heartbeat"))

                packet_age_sec = None
                if pkt_dt:
                    packet_age_sec = max(0.0, round((now - pkt_dt).total_seconds(), 1))
                    if packet_age_sec > 12.0:
                        current_system_state["data_source"] = "LIVE TELEMETRY STALE"
                    if packet_age_sec > 30.0:
                        has_live = False
                        current_system_state["has_live_data"] = False

                phys_age_sec = max(0.0, round((now - phys_dt).total_seconds(), 1)) if phys_dt else None
                sim_age_sec = max(0.0, round((now - sim_dt).total_seconds(), 1)) if sim_dt else None

                physical_esp32_online = (phys_age_sec is not None and phys_age_sec <= settings.DEVICE_HEARTBEAT_TIMEOUT_SECONDS)
                physical_esp32_status = "ONLINE" if physical_esp32_online else ("NOT CONNECTED" if phys_dt is None else "OFFLINE")

                is_sim_packet = (
                    current_system_state.get("device_mode") == "SIMULATOR"
                    or "SIM" in str(current_system_state.get("device_id", "")).upper()
                    or "SIMULATOR" in str(current_system_state.get("hardware_type", "")).upper()
                    or current_system_state.get("data_source") == "SIMULATED HARDWARE"
                )

                min_sim_age = None
                if is_sim_packet and packet_age_sec is not None and sim_age_sec is not None:
                    min_sim_age = min(packet_age_sec, sim_age_sec)
                elif is_sim_packet and packet_age_sec is not None:
                    min_sim_age = packet_age_sec
                elif sim_age_sec is not None:
                    min_sim_age = sim_age_sec

                simulator_online = (min_sim_age is not None and min_sim_age <= settings.DEVICE_HEARTBEAT_TIMEOUT_SECONDS)
                simulator_status = "ONLINE" if simulator_online else "OFFLINE"

                # STRICT ZERO-FABRICATION: esp32_online strictly represents physical hardware!
                esp32_online = physical_esp32_online
                esp32_status = physical_esp32_status
                current_system_state["device_status"] = esp32_status

                if physical_esp32_online:
                    dev_mode = "PHYSICAL"
                    hw_type = "ESP32-S3"
                    telem_src = "PHYSICAL_ESP32"
                elif simulator_online:
                    dev_mode = "SIMULATOR"
                    hw_type = "SIMULATOR"
                    telem_src = "SIMULATOR"
                else:
                    dev_mode = "NONE"
                    hw_type = None
                    telem_src = "NONE"

                sim_mqtt_conn = bool(health_service.simulator_state.get("mqtt_connected", False) or simulator_online)
                overall_mqtt_conn = mqtt_manager.connected or (sim_mqtt_conn if dev_mode == "SIMULATOR" else False)
                
                # ENFORCE ZERO FABRICATION: actively purge values if no live data
                has_live_eval = bool(current_system_state.get("has_live_data", False) and (physical_esp32_online or simulator_online))
                if not has_live_eval:
                    current_system_state["voltage"] = None
                    current_system_state["current"] = None
                    current_system_state["power"] = None
                    current_system_state["energy"] = None
                    current_system_state["frequency"] = None
                    current_system_state["power_factor"] = None
                    for ch in current_channels_state.values():
                        ch["voltage"] = None
                        ch["current"] = None
                        ch["active_power"] = None
                        ch["apparent_power"] = None

                payload = {
                    "type": "TELEMETRY_UPDATE",
                    "system": {
                        **current_system_state,
                        "device_mode": dev_mode,
                        "hardware_type": hw_type,
                        "telemetry_source": telem_src,
                        "last_update": pkt_dt.isoformat() if pkt_dt else None,
                        "packet_age_sec": packet_age_sec,
                        "physical_esp32_online": physical_esp32_online,
                        "physical_esp32_status": physical_esp32_status,
                        "simulator_online": simulator_online,
                        "simulator_status": simulator_status,
                        "esp32_online": esp32_online,
                        "esp32_status": esp32_status,
                        "last_heartbeat_age_sec": phys_age_sec if physical_esp32_online else sim_age_sec,
                        "last_heartbeat_iso": phys_dt.isoformat() if phys_dt else (sim_dt.isoformat() if sim_dt else None)
                    },
                    "channels": list(current_channels_state.values()),
                    "load_shedding_active": load_shedding_service.is_active,
                    "has_live_data": has_live,
                    "mqtt_connected": overall_mqtt_conn,
                    "mqtt_state": "MQTT_CONNECTED" if overall_mqtt_conn else "MQTT_DISCONNECTED",
                    "simulator_mqtt_connected": sim_mqtt_conn,
                    "physical_esp32_online": physical_esp32_online,
                    "physical_esp32_status": physical_esp32_status,
                    "simulator_online": simulator_online,
                    "simulator_status": simulator_status,
                    "esp32_online": esp32_online,
                    "device_mode": dev_mode,
                    "hardware_type": hw_type,
                    "telemetry_source": telem_src,
                    "timestamp": now.isoformat()
                }
                await ws_manager.broadcast(payload)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in telemetry loop: {e}")
            await asyncio.sleep(2.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting GRIDGUARD Industrial IoT Platform Backend...")
    await init_db()
    bg_task = None
    loop = asyncio.get_running_loop()
    mqtt_manager.set_telemetry_handler(handle_mqtt_telemetry, loop=loop)
    if os.getenv("TESTING") != "1":
        mqtt_manager.start()
        if settings.DEVICE_MODE == "SIMULATOR" and os.getenv("DISABLE_SIMULATOR") != "1":
            from backend.app.simulator.hardware_simulator import hardware_simulator
            hardware_simulator.start()
        bg_task = asyncio.create_task(telemetry_broadcast_loop())
    yield
    if bg_task:
        bg_task.cancel()
    from backend.app.simulator.hardware_simulator import hardware_simulator
    hardware_simulator.stop()
    print("GRIDGUARD Backend stopped.")


app = FastAPI(
    title="GRIDGUARD - Smart Transformer Protection & Assistive Load Device",
    description="Production-structured Industrial IoT, Protection, Digital Twin, and AI Operations Platform",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(face_router, prefix=settings.API_V1_STR)

@app.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    # Send immediate initial state
    try:
        now = datetime.datetime.utcnow()
        has_live = current_system_state.get("has_live_data", False)
        pkt_dt = _to_datetime_safe(current_system_state.get("last_update"))
        phys_dt = _to_datetime_safe(health_service.physical_esp32_state.get("last_heartbeat"))
        sim_dt = _to_datetime_safe(health_service.simulator_state.get("last_heartbeat"))

        packet_age_sec = None
        if pkt_dt:
            packet_age_sec = max(0.0, round((now - pkt_dt).total_seconds(), 1))

        phys_age_sec = max(0.0, round((now - phys_dt).total_seconds(), 1)) if phys_dt else None
        sim_age_sec = max(0.0, round((now - sim_dt).total_seconds(), 1)) if sim_dt else None

        physical_esp32_online = (phys_age_sec is not None and phys_age_sec <= settings.DEVICE_HEARTBEAT_TIMEOUT_SECONDS)
        physical_esp32_status = "ONLINE" if physical_esp32_online else ("NOT CONNECTED" if phys_dt is None else "OFFLINE")

        is_sim_packet = (
            current_system_state.get("device_mode") == "SIMULATOR"
            or "SIM" in str(current_system_state.get("device_id", "")).upper()
            or "SIMULATOR" in str(current_system_state.get("hardware_type", "")).upper()
            or current_system_state.get("data_source") == "SIMULATED HARDWARE"
        )

        min_sim_age = None
        if is_sim_packet and packet_age_sec is not None and sim_age_sec is not None:
            min_sim_age = min(packet_age_sec, sim_age_sec)
        elif is_sim_packet and packet_age_sec is not None:
            min_sim_age = packet_age_sec
        elif sim_age_sec is not None:
            min_sim_age = sim_age_sec

        simulator_online = (min_sim_age is not None and min_sim_age <= settings.DEVICE_HEARTBEAT_TIMEOUT_SECONDS)
        simulator_status = "ONLINE" if simulator_online else "OFFLINE"

        # STRICT ZERO-FABRICATION: esp32_online strictly represents physical hardware!
        esp32_online = physical_esp32_online
        esp32_status = physical_esp32_status
        current_system_state["device_status"] = esp32_status

        if physical_esp32_online:
            dev_mode = "PHYSICAL"
            hw_type = "ESP32-S3"
            telem_src = "PHYSICAL_ESP32"
            connection_status = "ONLINE"
        elif simulator_online:
            dev_mode = "SIMULATOR"
            hw_type = "SIMULATOR"
            telem_src = "SIMULATOR"
            connection_status = "ONLINE"
        else:
            dev_mode = "NONE"
            hw_type = None
            telem_src = "NONE"
            connection_status = "WAITING_FOR_DEVICE" if (phys_dt is None and sim_dt is None) else "OFFLINE"

        dev_id = current_system_state.get("device_id", "GRIDGUARD-ESP32-001")

        sim_mqtt_conn = bool(health_service.simulator_state.get("mqtt_connected", False) or simulator_online)
        overall_mqtt_conn = mqtt_manager.connected or (sim_mqtt_conn if dev_mode == "SIMULATOR" else False)

        has_live_eval = bool(current_system_state.get("has_live_data", False) and (physical_esp32_online or simulator_online))
        if not has_live_eval:
            current_system_state["voltage"] = None
            current_system_state["current"] = None
            current_system_state["power"] = None
            current_system_state["energy"] = None
            current_system_state["frequency"] = None
            current_system_state["power_factor"] = None
            for ch in current_channels_state.values():
                ch["voltage"] = None
                ch["current"] = None
                ch["active_power"] = None
                ch["apparent_power"] = None

        init_payload = {
            "type": "INITIAL_STATE",
            "system": {
                **current_system_state,
                "device_mode": dev_mode,
                "connection_status": connection_status,
                "system_connection_status": connection_status,
                "hardware_type": hw_type,
                "device_id": dev_id,
                "telemetry_source": telem_src,
                "last_update": pkt_dt.isoformat() if pkt_dt else None,
                "packet_age_sec": packet_age_sec,
                "physical_esp32_online": physical_esp32_online,
                "physical_esp32_status": physical_esp32_status,
                "simulator_online": simulator_online,
                "simulator_status": simulator_status,
                "esp32_online": esp32_online,
                "esp32_status": esp32_status,
                "device_connection_state": connection_status,
                "last_heartbeat_age_sec": phys_age_sec if physical_esp32_online else sim_age_sec,
                "last_heartbeat_iso": phys_dt.isoformat() if phys_dt else (sim_dt.isoformat() if sim_dt else None)
            },
            "channels": list(current_channels_state.values()),
            "load_shedding_active": load_shedding_service.is_active,
            "has_live_data": has_live,
            "mqtt_connected": overall_mqtt_conn,
            "mqtt_state": "MQTT_CONNECTED" if overall_mqtt_conn else "MQTT_DISCONNECTED",
            "simulator_mqtt_connected": sim_mqtt_conn,
            "physical_esp32_online": physical_esp32_online,
            "physical_esp32_status": physical_esp32_status,
            "simulator_online": simulator_online,
            "simulator_status": simulator_status,
            "esp32_online": esp32_online,
            "device_mode": dev_mode,
            "hardware_type": hw_type,
            "device_id": dev_id,
            "telemetry_source": telem_src,
            "timestamp": now.isoformat()
        }
        await websocket.send_text(json.dumps(init_payload, default=str))
        while True:
            data = await websocket.receive_text()
            # Handle client ping or messages
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket connection error: {e}")
        ws_manager.disconnect(websocket)

@app.get("/")
async def root():
    return {
        "platform": "GRIDGUARD",
        "tagline": "Intelligent Protection. Real-Time Visibility.",
        "status": "OPERATIONAL",
        "docs_url": "/docs",
        "api_prefix": settings.API_V1_STR
    }
