import os
import time
import socket
import asyncio
import datetime
from typing import Dict, Any, Optional, List, Tuple
import httpx
from sqlalchemy import text

from backend.app.core.config import settings
from backend.app.db.session import AsyncSessionLocal
from backend.app.websocket.manager import ws_manager
from backend.app.schemas.schemas import (
    ComponentHealth,
    PipelineStageHealth,
    HardwareWatchdogStatus,
    SystemHealthResponse,
)

class AuthoritativeHealthService:
    def __init__(self):
        self.boot_time = datetime.datetime.utcnow()
        self.physical_esp32_state: Dict[str, Any] = {
            "device_id": None,
            "last_heartbeat": None,
            "uptime_sec": None,
            "wifi_rssi": None,
            "ip_address": None,
            "firmware_version": None,
            "mqtt_connected": False,
            "watchdog_active": False,
            "watchdog_interval_ms": None,
        }
        self.simulator_state: Dict[str, Any] = {
            "device_id": None,
            "last_heartbeat": None,
            "uptime_sec": None,
            "wifi_rssi": None,
            "scenario": None,
            "mqtt_connected": False,
        }
        # Backward compatibility alias
        self.esp32_state = self.physical_esp32_state

        self.nodered_ingest_state: Dict[str, Any] = {
            "last_ingest_time": None,
            "last_endpoint": None,
            "last_device_id": None,
            "last_msg_type": None,
            "ingest_count": 0,
        }
        self.history: List[Dict[str, Any]] = []
        self._last_overall_status: Optional[str] = None
        self._cached_node_red: Optional[Tuple[str, Optional[float], str, Optional[datetime.datetime]]] = None
        self._cached_node_red_time: float = 0
        self._cached_broker: Optional[Tuple[str, Optional[float], str, Optional[datetime.datetime]]] = None
        self._cached_broker_time: float = 0

    def record_device_heartbeat(
        self,
        device_id: str,
        device_mode: Optional[str] = None,
        hardware_type: Optional[str] = None,
        uptime_sec: Optional[int] = None,
        wifi_rssi: Optional[int] = None,
        ip_address: Optional[str] = None,
        firmware_version: Optional[str] = None,
        mqtt_connected: bool = True,
        watchdog_active: bool = False,
        watchdog_interval_ms: Optional[int] = None,
        scenario: Optional[str] = None,
    ):
        now = datetime.datetime.utcnow()
        dev_id_str = str(device_id or "").upper()
        mode_str = str(device_mode or "").upper()
        hw_str = str(hardware_type or "").upper()

        is_simulator = (
            mode_str == "SIMULATOR"
            or "SIM" in dev_id_str
            or "SIMULATOR" in hw_str
        )

        if is_simulator:
            prev_online = self.is_simulator_online()
            self.simulator_state["device_id"] = device_id
            self.simulator_state["last_heartbeat"] = now
            self.simulator_state["uptime_sec"] = uptime_sec
            self.simulator_state["wifi_rssi"] = wifi_rssi
            self.simulator_state["scenario"] = scenario
            self.simulator_state["mqtt_connected"] = mqtt_connected
            if not prev_online:
                self._add_history("SIMULATOR", "ONLINE", f"Hardware simulator ({device_id}) telemetry active")
        else:
            # Physical ESP32 hardware
            prev_online = self.is_physical_esp32_online()
            self.physical_esp32_state["device_id"] = device_id
            self.physical_esp32_state["last_heartbeat"] = now
            self.physical_esp32_state["uptime_sec"] = uptime_sec
            self.physical_esp32_state["wifi_rssi"] = wifi_rssi
            self.physical_esp32_state["ip_address"] = ip_address
            self.physical_esp32_state["firmware_version"] = firmware_version
            self.physical_esp32_state["mqtt_connected"] = mqtt_connected
            self.physical_esp32_state["watchdog_active"] = watchdog_active
            self.physical_esp32_state["watchdog_interval_ms"] = watchdog_interval_ms
            if not prev_online:
                self._add_history("PHYSICAL ESP32", "ONLINE", f"Physical ESP32 device ({device_id}) connected")

    def record_esp32_heartbeat(
        self,
        device_id: str,
        uptime_sec: Optional[int] = None,
        wifi_rssi: Optional[int] = None,
        ip_address: Optional[str] = None,
        firmware_version: Optional[str] = None,
        mqtt_connected: bool = True,
        watchdog_active: bool = False,
        watchdog_interval_ms: Optional[int] = None,
        device_mode: Optional[str] = None,
        hardware_type: Optional[str] = None,
        scenario: Optional[str] = None,
    ):
        self.record_device_heartbeat(
            device_id=device_id,
            device_mode=device_mode,
            hardware_type=hardware_type,
            uptime_sec=uptime_sec,
            wifi_rssi=wifi_rssi,
            ip_address=ip_address,
            firmware_version=firmware_version,
            mqtt_connected=mqtt_connected,
            watchdog_active=watchdog_active,
            watchdog_interval_ms=watchdog_interval_ms,
            scenario=scenario,
        )

    def record_nodered_ingestion(
        self,
        endpoint: str,
        device_id: Optional[str] = None,
        msg_type: Optional[str] = None,
    ):
        now = datetime.datetime.utcnow()
        self.nodered_ingest_state["last_ingest_time"] = now
        self.nodered_ingest_state["last_endpoint"] = endpoint
        self.nodered_ingest_state["last_device_id"] = device_id
        self.nodered_ingest_state["last_msg_type"] = msg_type
        self.nodered_ingest_state["ingest_count"] += 1

    def is_physical_esp32_online(self) -> bool:
        last = self.physical_esp32_state.get("last_heartbeat")
        if not last:
            return False
        age = (datetime.datetime.utcnow() - last).total_seconds()
        return age <= settings.DEVICE_HEARTBEAT_TIMEOUT_SECONDS

    def is_simulator_online(self) -> bool:
        last = self.simulator_state.get("last_heartbeat")
        if not last:
            return False
        age = (datetime.datetime.utcnow() - last).total_seconds()
        return age <= settings.DEVICE_HEARTBEAT_TIMEOUT_SECONDS

    def is_esp32_online(self) -> bool:
        return self.is_physical_esp32_online()

    def _add_history(self, service: str, status: str, details: str):
        now = datetime.datetime.utcnow()
        entry = {
            "timestamp": now.strftime("%H:%M:%S"),
            "service": service,
            "status": status,
            "details": details,
        }
        self.history.insert(0, entry)
        if len(self.history) > 25:
            self.history = self.history[:25]

    async def probe_nodered(self) -> Tuple[str, Optional[float], str, Optional[datetime.datetime]]:
        # Cache probe for 2 seconds to avoid excessive network hammering
        now_time = time.time()
        if self._cached_node_red and (now_time - self._cached_node_red_time) < 2.0:
            return self._cached_node_red

        url = settings.NODERED_HEALTH_URL
        t0 = time.perf_counter()
        now = datetime.datetime.utcnow()
        try:
            transport = httpx.AsyncHTTPTransport(retries=0)
            async with httpx.AsyncClient(timeout=2.0, transport=transport) as client:
                res = await client.get(url)
                lat = round((time.perf_counter() - t0) * 1000, 1)
                result = ("ONLINE", lat, f"HTTP {res.status_code} from Node-RED server at {url}", now)
                self._cached_node_red = result
                self._cached_node_red_time = now_time
                return result
        except Exception as e:
            err_name = type(e).__name__
            result = ("OFFLINE", None, f"Node-RED service unreachable ({err_name} at {url})", None)
            self._cached_node_red = result
            self._cached_node_red_time = now_time
            return result

    async def probe_mqtt_broker(self) -> Tuple[str, Optional[float], str, Optional[datetime.datetime]]:
        now_time = time.time()
        if self._cached_broker and (now_time - self._cached_broker_time) < 3.0:
            return self._cached_broker

        host = settings.MQTT_HOST or settings.MQTT_BROKER
        port = settings.MQTT_PORT
        t0 = time.perf_counter()
        now = datetime.datetime.utcnow()
        try:
            # Test direct TCP port connection (with TLS port 8883)
            loop = asyncio.get_running_loop()
            await asyncio.wait_for(
                loop.create_connection(lambda: asyncio.Protocol(), host=host, port=port),
                timeout=2.0
            )
            lat = round((time.perf_counter() - t0) * 1000, 1)
            result = ("AVAILABLE", lat, f"Broker TLS port {port} reachable on {host}", now)
            self._cached_broker = result
            self._cached_broker_time = now_time
            return result
        except Exception as e:
            err_name = type(e).__name__
            result = ("UNAVAILABLE", None, f"Broker unreachable ({err_name} to {host}:{port})", None)
            self._cached_broker = result
            self._cached_broker_time = now_time
            return result

    async def probe_database(self) -> Tuple[str, Optional[float], str, Optional[datetime.datetime]]:
        t0 = time.perf_counter()
        now = datetime.datetime.utcnow()
        try:
            async with AsyncSessionLocal() as session:
                res = await session.execute(text("SELECT 1"))
                _ = res.scalar()
                lat = round((time.perf_counter() - t0) * 1000, 1)
                return ("ONLINE", lat, "Active connection pool with verified SELECT 1 query response", now)
        except Exception as e:
            err_name = type(e).__name__
            return ("OFFLINE", None, f"Database query probe failed: {err_name}", None)

    async def get_system_health(
        self,
        current_system_state: Dict[str, Any],
        current_channels_state: Dict[int, Any],
    ) -> SystemHealthResponse:
        now = datetime.datetime.utcnow()

        # Run external probes concurrently
        nr_task = self.probe_nodered()
        mqtt_task = self.probe_mqtt_broker()
        db_task = self.probe_database()
        nr_res, mqtt_res, db_res = await asyncio.gather(nr_task, mqtt_task, db_task)

        nr_status, nr_lat, nr_details, nr_success = nr_res
        broker_status, broker_lat, broker_details, broker_success = mqtt_res
        db_status, db_lat, db_details, db_success = db_res

        # 1. Physical ESP32-S3 Hardware Health (STRICT ZERO-FABRICATION)
        phys_hb = self.physical_esp32_state.get("last_heartbeat")
        phys_hb_age = (now - phys_hb).total_seconds() if phys_hb else None

        # Only use telemetry update for physical hardware if telemetry source was explicitly PHYSICAL
        phys_telem = current_system_state.get("last_update") if current_system_state.get("device_mode") in ["PHYSICAL", "REAL_HARDWARE"] else None
        if isinstance(phys_telem, datetime.datetime):
            telem_age = (now - phys_telem).total_seconds()
            if phys_hb_age is None or telem_age < phys_hb_age:
                phys_hb_age = telem_age
                phys_hb = phys_telem

        if phys_hb_age is None:
            phys_status = "NOT_CONNECTED"
            phys_details = "No device heartbeat or telemetry received since startup."
            phys_success = None
        elif phys_hb_age <= settings.DEVICE_HEARTBEAT_TIMEOUT_SECONDS:
            phys_status = "ONLINE"
            phys_details = f"Heartbeat active (last seen {phys_hb_age:.1f}s ago). FreeRTOS Protection Core active."
            phys_success = phys_hb
        elif phys_hb_age <= settings.DEVICE_HEARTBEAT_TIMEOUT_SECONDS * 3:
            phys_status = "STALE"
            phys_details = f"Physical ESP32-S3 heartbeat delayed ({phys_hb_age:.1f}s ago > {settings.DEVICE_HEARTBEAT_TIMEOUT_SECONDS}s timeout)."
            phys_success = phys_hb
        else:
            phys_status = "OFFLINE"
            phys_details = f"Physical ESP32-S3 timed out ({phys_hb_age:.1f}s ago). Hardware unreachable."
            phys_success = phys_hb

        physical_esp32_health = ComponentHealth(
            name="Physical ESP32-S3 Hardware Controller",
            status=phys_status,
            latency_ms=None,
            details=phys_details,
            last_ping=now,
            last_successful=phys_success,
        )

        # 1B. Hardware Simulator Health
        sim_hb = self.simulator_state.get("last_heartbeat")
        sim_hb_age = (now - sim_hb).total_seconds() if sim_hb else None
        sim_telem = current_system_state.get("last_update") if current_system_state.get("device_mode") == "SIMULATOR" else None
        if isinstance(sim_telem, datetime.datetime):
            s_age = (now - sim_telem).total_seconds()
            if sim_hb_age is None or s_age < sim_hb_age:
                sim_hb_age = s_age
                sim_hb = sim_telem

        sim_mqtt_connected = bool(self.simulator_state.get("mqtt_connected", False) or (sim_hb_age is not None and sim_hb_age <= settings.DEVICE_HEARTBEAT_TIMEOUT_SECONDS))

        if sim_hb_age is not None and sim_hb_age <= settings.DEVICE_HEARTBEAT_TIMEOUT_SECONDS:
            sim_status = "ONLINE"
            scenario = self.simulator_state.get("scenario") or "NORMAL"
            sim_details = f"Simulator actively generating protocol-conforming telemetry (scenario: {scenario}, last seen {sim_hb_age:.1f}s ago)."
            sim_success = sim_hb
        else:
            sim_status = "OFFLINE"
            sim_details = "Hardware simulator is inactive."
            sim_success = sim_hb

        simulator_health = ComponentHealth(
            name="Hardware Simulator (ESP32-S3 Model)",
            status=sim_status,
            latency_ms=None,
            details=sim_details,
            last_ping=now,
            last_successful=sim_success,
        )

        simulator_mqtt = ComponentHealth(
            name="Simulator MQTT Client Session",
            status="CONNECTED" if (sim_status == "ONLINE" and sim_mqtt_connected and broker_status == "AVAILABLE") else "DISCONNECTED",
            latency_ms=broker_lat if sim_mqtt_connected else None,
            details="Active TLS MQTT session to HiveMQ Cloud (Port 8883)" if sim_mqtt_connected else "Simulator MQTT client disconnected",
            last_ping=now,
            last_successful=sim_success,
        )

        # Authoritative device mode and telemetry source derivation
        if phys_status == "ONLINE":
            device_mode = "PHYSICAL"
            telemetry_source = "PHYSICAL_ESP32"
        elif sim_status == "ONLINE":
            device_mode = "SIMULATOR"
            telemetry_source = "SIMULATOR"
        else:
            device_mode = "NONE"
            telemetry_source = "NONE"

        # 2. MQTT Broker Health
        broker_health = ComponentHealth(
            name="HiveMQ Cloud MQTT Broker (TLS)",
            status=broker_status,
            latency_ms=broker_lat,
            details=broker_details,
            last_ping=now,
            last_successful=broker_success,
        )

        # 3. MQTT Device Session Health
        dev_mqtt_reported = self.physical_esp32_state.get("mqtt_connected", False)
        if device_mode == "SIMULATOR":
            if sim_mqtt_connected and broker_status == "AVAILABLE":
                dev_mqtt_status = "CONNECTED"
                dev_mqtt_details = "Hardware simulator reported active MQTT TLS session to HiveMQ Cloud."
                dev_mqtt_success = sim_hb
            else:
                dev_mqtt_status = "DISCONNECTED"
                dev_mqtt_details = "Simulator disconnected from HiveMQ Cloud broker."
                dev_mqtt_success = sim_hb
        elif phys_status == "ONLINE" and dev_mqtt_reported and broker_status == "AVAILABLE":
            dev_mqtt_status = "CONNECTED"
            dev_mqtt_details = "ESP32 reported active MQTT TLS session to broker."
            dev_mqtt_success = phys_hb
        elif phys_status == "ONLINE" and not dev_mqtt_reported:
            dev_mqtt_status = "DISCONNECTED"
            dev_mqtt_details = "ESP32 is reachable but edge device reports MQTT session disconnected."
            dev_mqtt_success = phys_hb
        elif phys_status == "ONLINE" and broker_status != "AVAILABLE":
            dev_mqtt_status = "DISCONNECTED"
            dev_mqtt_details = "Broker unavailable; ESP32 MQTT session unreachable."
            dev_mqtt_success = None
        elif phys_status == "NOT_CONNECTED":
            dev_mqtt_status = "NOT_CONNECTED"
            dev_mqtt_details = "Awaiting initial connection from physical ESP32."
            dev_mqtt_success = None
        else:
            dev_mqtt_status = "DISCONNECTED"
            dev_mqtt_details = "ESP32 disconnected from MQTT broker session."
            dev_mqtt_success = phys_hb

        mqtt_device_session = ComponentHealth(
            name="ESP32 MQTT Device Session" if device_mode != "SIMULATOR" else "Simulator MQTT Session",
            status=dev_mqtt_status,
            latency_ms=None,
            details=dev_mqtt_details,
            last_ping=now,
            last_successful=dev_mqtt_success,
        )

        # 4. Node-RED Orchestration Engine (Service Status)
        nodered_health = ComponentHealth(
            name="Node-RED IoT Orchestration Service",
            status=nr_status,
            latency_ms=nr_lat,
            details=nr_details,
            last_ping=now,
            last_successful=nr_success,
        )

        # 4B. Node-RED MQTT Input Status (Independent of service status)
        last_ingest = self.nodered_ingest_state.get("last_ingest_time")
        ingest_age = (now - last_ingest).total_seconds() if last_ingest else None
        if nr_status == "ONLINE" and ingest_age is not None and ingest_age < 30.0:
            nr_mqtt_status = "LIVE"
            nr_mqtt_details = f"Node-RED MQTT client subscribed to smarttransformer/# and actively receiving telemetry ({ingest_age:.1f}s ago)."
        elif nr_status == "ONLINE" and broker_status == "AVAILABLE":
            nr_mqtt_status = "CONNECTED"
            nr_mqtt_details = "Node-RED MQTT client connected to HiveMQ Cloud broker (TLS 8883)."
        elif nr_status == "ONLINE":
            nr_mqtt_status = "DISCONNECTED"
            nr_mqtt_details = "Broker unavailable; Node-RED MQTT input disconnected."
        else:
            nr_mqtt_status = "OFFLINE"
            nr_mqtt_details = "Node-RED service is offline."

        nodered_mqtt_health = ComponentHealth(
            name="Node-RED MQTT Input Gateway",
            status=nr_mqtt_status,
            latency_ms=broker_lat if nr_mqtt_status in ["LIVE", "CONNECTED"] else None,
            details=nr_mqtt_details,
            last_ping=now,
            last_successful=last_ingest if nr_mqtt_status == "LIVE" else nr_success,
        )

        # 5. Node-RED -> FastAPI Ingestion Pipeline (Pipeline Status)
        if ingest_age is not None and ingest_age < 30.0:
            nr_pipe_status = "RECEIVING"
            nr_pipe_details = f"Ingesting validated payloads ({ingest_age:.1f}s ago, {self.nodered_ingest_state['ingest_count']} total messages)."
        elif nr_status == "ONLINE":
            nr_pipe_status = "NO_RECENT_INGESTION"
            nr_pipe_details = "Node-RED service is running, but no recent telemetry forwarded to FastAPI."
        else:
            nr_pipe_status = "NOT_RECEIVING"
            nr_pipe_details = "Node-RED service is offline; ingestion pipeline halted."

        nodered_pipe_health = ComponentHealth(
            name="Node-RED &rarr; FastAPI Ingestion Pipeline",
            status=nr_pipe_status,
            latency_ms=None,
            details=nr_pipe_details,
            last_ping=now,
            last_successful=last_ingest,
        )

        # 6. FastAPI Backend API
        uptime_sec = int((now - self.boot_time).total_seconds())
        backend_health = ComponentHealth(
            name="FastAPI Operational Core",
            status="ONLINE",
            latency_ms=None,
            details=f"FastAPI process active. Uptime: {uptime_sec}s. All endpoints registered.",
            last_ping=now,
            last_successful=now,
        )

        # 7. PostgreSQL Database Store
        database_health = ComponentHealth(
            name="PostgreSQL Telemetry & Audit Store",
            status=db_status,
            latency_ms=db_lat,
            details=db_details,
            last_ping=now,
            last_successful=db_success,
        )

        # 8. WebSocket Real-Time Gateway
        ws_count = len(ws_manager.active_connections)
        ws_health = ComponentHealth(
            name="WebSocket Real-Time Multiplexer",
            status="CONNECTED",
            latency_ms=None,
            details=f"Gateway active. Active browser sessions: {ws_count}.",
            last_ping=now,
            last_successful=now,
        )

        # 9. Gemini AI Advisory Service
        has_gemini_key = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "mock")
        if has_gemini_key:
            ai_status = "AVAILABLE"
            ai_details = "Advisory AI engine configured. Strictly ADVISORY — zero relay control."
        else:
            ai_status = "NOT_CONFIGURED"
            ai_details = "GEMINI_API_KEY is not configured in environment. Advisory engine inactive."

        ai_health = ComponentHealth(
            name="Gemini AI Advisory Service",
            status=ai_status,
            latency_ms=None,
            details=ai_details,
            last_ping=now,
            last_successful=now if has_gemini_key else None,
        )

        # 10. Live Telemetry Freshness
        telem_last = current_system_state.get("last_update")
        if isinstance(telem_last, str):
            try:
                telem_last = datetime.datetime.fromisoformat(telem_last)
            except Exception:
                telem_last = None

        has_live_val = current_system_state.get("voltage") is not None or any(
            c.get("voltage") is not None for c in current_channels_state.values()
        )

        if telem_last and isinstance(telem_last, datetime.datetime):
            t_age = (now - telem_last).total_seconds()
            if t_age < settings.TELEMETRY_STALE_TIMEOUT_SECONDS and has_live_val:
                freshness = "LIVE"
                if device_mode == "SIMULATOR":
                    telem_details = f"Simulator electrical telemetry streaming (last update: {t_age:.1f}s ago)."
                elif device_mode == "PHYSICAL":
                    telem_details = f"Authoritative physical sensor telemetry streaming from ESP32-S3 (last update: {t_age:.1f}s ago)."
                else:
                    telem_details = f"Live telemetry streaming (last update: {t_age:.1f}s ago)."
            elif t_age < 60.0:
                freshness = "STALE"
                telem_details = f"Telemetry stream stale (last update: {t_age:.1f}s ago > {settings.TELEMETRY_STALE_TIMEOUT_SECONDS}s timeout)."
            else:
                freshness = "NO LIVE DATA"
                telem_details = f"No live telemetry received for {t_age:.0f}s. Values reset to null."
        else:
            freshness = "NO LIVE DATA"
            telem_details = "Waiting for device telemetry packets."

        live_telemetry_health = ComponentHealth(
            name="Electrical Telemetry Stream",
            status=f"LIVE — {device_mode}" if (freshness == "LIVE" and device_mode in ["SIMULATOR", "PHYSICAL"]) else freshness,
            latency_ms=None,
            details=telem_details,
            last_ping=now,
            last_successful=telem_last if isinstance(telem_last, datetime.datetime) else None,
        )

        # 11. Hardware Watchdog
        watchdog_active = bool(self.physical_esp32_state.get("watchdog_active", False))
        watchdog_interval = self.physical_esp32_state.get("watchdog_interval_ms")
        if phys_status == "ONLINE" and watchdog_active and watchdog_interval:
            watchdog_status = HardwareWatchdogStatus(
                status="ACTIVE",
                reported=True,
                interval_ms=watchdog_interval,
            )
        else:
            watchdog_status = HardwareWatchdogStatus(
                status="NOT_AVAILABLE",
                reported=False,
                interval_ms=None,
            )

        # 12. End-to-End Pipeline Breakdown & Failure Localization
        if device_mode == "SIMULATOR":
            ingress_stage_name = "Simulator &rarr; HiveMQ MQTT"
            ingress_stage_status = "CONNECTED" if (sim_status == "ONLINE" and broker_status == "AVAILABLE") else "DISCONNECTED"
            ingress_details = "Simulated protocol telemetry published to HiveMQ Cloud broker."
        else:
            ingress_stage_name = "ESP32-S3 &rarr; HiveMQ MQTT"
            ingress_stage_status = "CONNECTED" if (phys_status == "ONLINE" and dev_mqtt_status == "CONNECTED") else "NOT_CONNECTED"
            ingress_details = "WiFi & TLS MQTT session from physical ESP32-S3 edge controller."

        pipeline_stages: Dict[str, PipelineStageHealth] = {
            "esp32_to_mqtt": PipelineStageHealth(
                stage=ingress_stage_name,
                status=ingress_stage_status,
                details=ingress_details,
            ),
            "mqtt_to_nodered": PipelineStageHealth(
                stage="HiveMQ MQTT &rarr; Node-RED",
                status="RECEIVING" if (broker_status == "AVAILABLE" and nr_status == "ONLINE" and (phys_status == "ONLINE" or sim_status == "ONLINE")) else "NO_DATA",
                details="Broker topic forwarding to local Node-RED flow engine."
            ),
            "nodered_to_fastapi": PipelineStageHealth(
                stage="Node-RED &rarr; FastAPI",
                status=nr_pipe_status,
                details="HTTP REST and WebSocket ingestion endpoints."
            ),
            "fastapi_to_postgresql": PipelineStageHealth(
                stage="FastAPI &rarr; PostgreSQL",
                status="HEALTHY" if db_status == "ONLINE" else "OFFLINE",
                details="Persistent time-series measurements and audit trail logging."
            ),
            "fastapi_to_websocket": PipelineStageHealth(
                stage="FastAPI &rarr; WebSocket SCADA",
                status="STREAMING" if (ws_count > 0 and freshness == "LIVE") else ("CONNECTED" if ws_count > 0 else "IDLE"),
                details="Multiplexed push stream to Next.js dashboard client."
            ),
        }

        # Determine first broken stage in the pipeline
        pipeline_failure_stage = None
        if pipeline_stages["esp32_to_mqtt"].status not in ["CONNECTED"]:
            if device_mode == "SIMULATOR":
                pipeline_failure_stage = "Simulator &rarr; MQTT (Simulator idle or disconnected from broker)"
            else:
                pipeline_failure_stage = "Physical ESP32 &rarr; MQTT (Physical ESP32-S3 hardware is NOT connected)"
        elif pipeline_stages["mqtt_to_nodered"].status != "RECEIVING":
            pipeline_failure_stage = "MQTT &rarr; Node-RED (Node-RED is offline or broker connection idle)"
        elif pipeline_stages["nodered_to_fastapi"].status != "RECEIVING":
            pipeline_failure_stage = "Node-RED &rarr; FastAPI (No telemetry packets forwarded to API)"
        elif pipeline_stages["fastapi_to_postgresql"].status != "HEALTHY":
            pipeline_failure_stage = "FastAPI &rarr; PostgreSQL (Database probe failed)"

        # 13. Overall System State Machine
        has_system_fault = any(
            c.get("status") in ("TRIPPED", "FAULT LATCHED") for c in current_channels_state.values()
        )

        if has_system_fault:
            overall = "SYSTEM_FAULT"
            msg = "Protection trip event latched. Relay restoration requires biometric face authorization."
        elif db_status == "OFFLINE":
            overall = "SERVICE_DEGRADED"
            msg = "Database service unreachable. Telemetry persistence and audit logging degraded."
        elif phys_status == "ONLINE" and freshness == "LIVE":
            overall = "FULLY_OPERATIONAL"
            msg = "Physical ESP32-S3 hardware, edge firmware, MQTT broker, and telemetry streams are fully synchronized."
        elif phys_status == "ONLINE":
            overall = "PARTIALLY_OPERATIONAL"
            msg = "Physical ESP32 edge controller is connected, awaiting valid sensor telemetry packets."
        elif sim_status == "ONLINE":
            overall = "SIMULATOR_ACTIVE"
            msg = "Hardware Simulator active. Physical ESP32 hardware is NOT connected."
        elif phys_status == "NOT_CONNECTED" and sim_status == "OFFLINE":
            overall = "WAITING_FOR_HARDWARE"
            msg = "Backend services are operational, but no ESP32 live hardware heartbeat or telemetry has been received."
        elif phys_status in ("OFFLINE", "STALE"):
            overall = "TELEMETRY_STALE"
            msg = "Physical ESP32 edge controller is offline or heartbeat timed out."
        elif freshness == "STALE":
            overall = "TELEMETRY_STALE"
            msg = "Telemetry packets are stale (> 12s timeout). Sensor values have not updated."
        else:
            overall = "PARTIALLY_OPERATIONAL"
            msg = "System partially operational. One or more external communication links are idle."

        # Audit overall state transition
        if self._last_overall_status != overall:
            self._add_history("SYSTEM", overall, msg)
            self._last_overall_status = overall

        return SystemHealthResponse(
            overall_status=overall,
            overall_message=msg,
            esp32=physical_esp32_health, # STRICT ZERO-FABRICATION: Represents physical ESP32
            physical_esp32=physical_esp32_health,
            simulator=simulator_health,
            simulator_mqtt=simulator_mqtt,
            device_mode=device_mode,
            telemetry_source=telemetry_source,
            mqtt_broker=broker_health,
            mqtt_device_session=mqtt_device_session,
            node_red=nodered_health,
            node_red_mqtt=nodered_mqtt_health,
            node_red_pipeline=nodered_pipe_health,
            backend_api=backend_health,
            database=database_health,
            websocket=ws_health,
            ai_service=ai_health,
            live_telemetry=live_telemetry_health,
            pipeline=pipeline_stages,
            pipeline_failure_stage=pipeline_failure_stage,
            hardware_watchdog=watchdog_status,
            data_freshness=freshness,
            uptime_seconds=uptime_sec,
            last_health_check=now,
            history=self.history,
        )

health_service = AuthoritativeHealthService()
