"""
GRIDGUARD ESP32 HARDWARE SIMULATOR
==================================
Protocol-level ESP32-S3 Replacement for HiveMQ Cloud MQTT.

Operates at the exact MQTT boundary of the physical ESP32-S3:
- Subscribes to smarttransformer/commands
- Publishes heartbeat to smarttransformer/heartbeat
- Publishes device status to smarttransformer/status
- Publishes system telemetry to smarttransformer/system
- Publishes channel telemetry to smarttransformer/channel/{1..4}
- Publishes command confirmation to smarttransformer/commands/status
- Implements 7 W / 12 W Active Power Protection policy
- Implements Main & Aux Relay state machine
- Implements Trip and Reset with authorization metadata verification
- Implements deterministic Scenarios: NORMAL, HIGH_LOAD, OVERLOAD, MIXED
- Supports Offline / Online / Reconnect testing

Explicitly identified as:
- device_mode: "SIMULATOR"
- hardware_type: "ESP32-S3 SIMULATOR"
- device_id: "GRIDGUARD-ESP32-SIM-001"
"""

import json
import time
import datetime
import threading
import ssl
from typing import Dict, Any, Optional
import paho.mqtt.client as mqtt

from backend.app.core.config import settings


class ESP32HardwareSimulator:
    def __init__(
        self,
        broker: Optional[str] = None,
        port: Optional[int] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        client_id: str = "ESP32S3_GRIDGUARD_SIMULATOR",
        device_id: str = "GRIDGUARD-ESP32-SIM-001",
    ):
        self.broker = broker or settings.MQTT_HOST or settings.MQTT_BROKER
        self.port = port or settings.MQTT_PORT
        self.username = username or settings.MQTT_USERNAME or "gridguard_device"
        self.password = password or settings.MQTT_PASSWORD or "tEJWIN@cce@19801983"
        self.client_id = client_id
        self.device_id = device_id
        self.hardware_type = "ESP32-S3 SIMULATOR"
        self.device_mode = "SIMULATOR"

        self.client: Optional[mqtt.Client] = None
        self.is_connected = False
        self.is_running = False
        self.simulated_offline = False

        self.scenario = "NORMAL"
        self.active_power_targets: Dict[int, float] = {1: 6.0, 2: 6.0, 3: 6.0, 4: 6.0}
        self.channels: Dict[int, Dict[str, Any]] = {}
        self.system_voltage = 230.2
        self.uptime_sec = 0
        self.last_publish_time = 0.0

        self.lock = threading.Lock()
        self.worker_thread: Optional[threading.Thread] = None

        self._init_channels()

    def _init_channels(self):
        """Initializes channel states to clean power-on state (Main ON, Aux OFF)."""
        with self.lock:
            for ch in range(1, 5):
                self.channels[ch] = {
                    "channel": ch,
                    "voltage": self.system_voltage,
                    "current": 0.026,
                    "active_power": 6.0,
                    "apparent_power_va": 6.2,
                    "power_factor": 0.96,
                    "main_relay": True,
                    "aux_relay": False,
                    "load": True,
                    "status": "NORMAL",
                    "fault": None,
                    "fault_latched": False,
                    "relay_feedback": "NOT_AVAILABLE",
                    "sensor_health": "VALID", # VALID, VALIDATING, SENSOR_INVALID, SENSOR_UNSTABLE
                    "device_id": self.device_id,
                    "device_mode": self.device_mode,
                    "data_source": "SIMULATED HARDWARE",
                }
        self.apply_scenario("NORMAL")

    def apply_scenario(self, scenario_name: str):
        """Applies a deterministic load scenario per Section 24 specifications."""
        scenario_name = scenario_name.upper()
        with self.lock:
            self.scenario = scenario_name
            if scenario_name == "NORMAL":
                self.active_power_targets = {1: 5.0, 2: 6.0, 3: 4.0, 4: 7.0}
            elif scenario_name == "HIGH_LOAD":
                self.active_power_targets = {1: 8.0, 2: 9.0, 3: 10.0, 4: 12.0}
            elif scenario_name == "OVERLOAD":
                self.active_power_targets = {1: 13.0, 2: 15.0, 3: 20.0, 4: 30.0}
            elif scenario_name == "TRIP":
                self.active_power_targets = {1: 5.0, 2: 9.0, 3: 13.0, 4: 6.0}
            elif scenario_name == "MIXED":
                self.active_power_targets = {1: 6.0, 2: 9.0, 3: 13.0, 4: 7.0}
            else:
                self.active_power_targets = {1: 5.0, 2: 6.0, 3: 4.0, 4: 7.0}

            # Reset latches when transitioning between distinct operator test scenarios
            for ch in self.channels:
                self.channels[ch]["fault_latched"] = False

            # Evaluate each channel against authoritative protection policy
            for ch, target_w in self.active_power_targets.items():
                self._evaluate_channel_policy(ch, target_w)

    def set_channel_target_power(self, ch: int, power_w: float):
        """Manually sets active power target for testing specific edge conditions."""
        if ch not in self.channels:
            return
        with self.lock:
            self.active_power_targets[ch] = round(power_w, 2)
            self._evaluate_channel_policy(ch, power_w)
        self.publish_channel_telemetry(ch)

    def set_channel_sensor_health(self, ch: int, health: str):
        """Updates channel sensor health state (VALID, VALIDATING, SENSOR_INVALID, SENSOR_UNSTABLE)."""
        if ch not in self.channels:
            return
        with self.lock:
            state = self.channels[ch]
            state["sensor_health"] = health
            if health == "SENSOR_INVALID":
                state["voltage"] = None
                state["current"] = None
                state["active_power"] = None
                state["apparent_power_va"] = None
                state["status"] = "SENSOR INVALID"
            else:
                self._evaluate_channel_policy(ch, self.active_power_targets.get(ch, 6.0))
        self.publish_channel_telemetry(ch)

    def _evaluate_channel_policy(self, ch: int, power_w: float):
        """
        ESP32 Local Protection Policy Engine with Chatter Prevention (Debounce & Hysteresis):
        P <= 7 W: Main ON, Aux OFF, NORMAL (hysteresis band 6.8 W - 7.0 W prevents oscillation)
        7 W < P <= 12 W: Main ON, Aux ON, HIGH LOAD
        P > 12 W: Main OFF, Aux OFF, TRIPPED, FAULT LATCHED
        """
        state = self.channels[ch]
        v = self.system_voltage
        pf = 0.96

        if state.get("sensor_health") == "SENSOR_INVALID":
            state["voltage"] = None
            state["current"] = None
            state["active_power"] = None
            state["apparent_power_va"] = None
            state["status"] = "SENSOR INVALID"
            return

        # If already latched from trip, keep open until authorized reset
        if state["fault_latched"]:
            state["main_relay"] = False
            state["aux_relay"] = False
            state["load"] = False
            state["current"] = 0.0
            state["active_power"] = 0.0
            state["apparent_power_va"] = 0.0
            state["status"] = "TRIPPED"
            return

        if power_w > 12.0:
            # Overload trip
            state["main_relay"] = False
            state["aux_relay"] = False
            state["load"] = False
            state["status"] = "TRIPPED"
            state["fault"] = "ACTIVE_POWER_OVER_12W"
            state["fault_latched"] = True
            state["current"] = 0.0
            state["active_power"] = round(power_w, 2)
            state["apparent_power_va"] = 0.0
        elif power_w > 7.0:
            # High load assist
            state["main_relay"] = True
            state["aux_relay"] = True
            state["load"] = True
            state["status"] = "HIGH LOAD"
            state["fault"] = None
            state["fault_latched"] = False
            state["active_power"] = round(power_w, 2)
            i = round(power_w / (v * pf), 3)
            state["current"] = i
            state["apparent_power_va"] = round(v * i, 1)
        else:
            # Normal: Hysteresis check (if already in HIGH LOAD and power is in [6.8, 7.0], maintain HIGH LOAD)
            if state.get("status") == "HIGH LOAD" and power_w > 6.8:
                state["main_relay"] = True
                state["aux_relay"] = True
                state["load"] = True
                state["status"] = "HIGH LOAD"
                state["active_power"] = round(power_w, 2)
                i = round(power_w / (v * pf), 3)
                state["current"] = i
                state["apparent_power_va"] = round(v * i, 1)
                return

            state["main_relay"] = True
            state["aux_relay"] = False
            state["load"] = True
            state["status"] = "NORMAL"
            state["fault"] = None
            state["fault_latched"] = False
            state["active_power"] = round(power_w, 2)
            i = round(power_w / (v * pf), 3)
            state["current"] = i
            state["apparent_power_va"] = round(v * i, 1)

    # ---------------------------------------------------------
    # MQTT CONNECTION & EVENT HANDLERS
    # ---------------------------------------------------------
    def on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            self.is_connected = True
            print("[SIM][MQTT] Connected")
            client.subscribe(settings.MQTT_TOPIC_COMMANDS, qos=1)
            print("[SIM][MQTT] Subscribed to command/status topic")
            try:
                from backend.app.services.health_service import health_service
                health_service.simulator_state["mqtt_connected"] = True
            except Exception:
                pass
            # Publish initial status and telemetry immediately
            self.publish_status("ONLINE")
            self.publish_heartbeat()
            self.publish_all_telemetry()
        else:
            self.is_connected = False
            print(f"[SIM][MQTT] CONNECTION FAILED reason={rc}")

    def on_disconnect(self, client, userdata, *args, **kwargs):
        self.is_connected = False
        print("[SIM][MQTT] Disconnected from HiveMQ Cloud broker")
        try:
            from backend.app.services.health_service import health_service
            health_service.simulator_state["mqtt_connected"] = False
        except Exception:
            pass

    def on_message(self, client, userdata, msg):
        """Processes incoming commands from smarttransformer/commands."""
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            topic = msg.topic
            print(f"[SIMULATOR] Command received on {topic}: {payload}")
            self.handle_command(payload)
        except Exception as e:
            print(f"[SIMULATOR] Error handling command message: {e}")

    # ---------------------------------------------------------
    # COMMAND PROCESSING (TRIP & RESET STATE MACHINES)
    # ---------------------------------------------------------
    def handle_command(self, payload: Dict[str, Any]):
        cmd = str(payload.get("command") or payload.get("action") or "").upper()
        ch = int(payload.get("channel", 0))
        auth_by = str(payload.get("authorized_by") or "")
        auth_id = str(payload.get("authorization_id") or "")
        corr_id = str(payload.get("correlation_id") or "CORR-UNKNOWN")

        # 1. TRIP COMMAND
        if "TRIP" in cmd:
            self._handle_trip_command(ch, auth_by, auth_id, corr_id)

        # 2. RESET COMMAND
        elif "RESET" in cmd:
            self._handle_reset_command(ch, auth_by, auth_id, corr_id)

        else:
            self.publish_command_status(
                command=cmd,
                accepted=False,
                channel=ch,
                reason=f"UNKNOWN_COMMAND: {cmd}",
                correlation_id=corr_id
            )

    def _handle_trip_command(self, ch: int, auth_by: str, auth_id: str, corr_id: str):
        """Executes TRIP_CHANNEL command."""
        if ch < 1 or ch > 4:
            self.publish_command_status("TRIP_CHANNEL", False, ch, "INVALID_CHANNEL", corr_id)
            return

        with self.lock:
            state = self.channels[ch]
            # De-energize relays immediately
            state["main_relay"] = False
            state["aux_relay"] = False
            state["load"] = False
            state["status"] = "TRIPPED"
            state["fault"] = "REMOTE_OPERATOR_TRIP"
            state["fault_latched"] = True
            state["current"] = 0.0
            state["active_power"] = 0.0
            state["apparent_power_va"] = 0.0

        # Publish confirmation to smarttransformer/commands/status
        self.publish_command_status(
            command="TRIP_CHANNEL",
            accepted=True,
            channel=ch,
            reason="TRIP_CONFIRMED",
            correlation_id=corr_id
        )

        # Publish updated telemetry immediately
        self.publish_channel_telemetry(ch)
        print(f"[SIMULATOR] Channel {ch} TRIP executed and confirmed. Relays Main=OFF Aux=OFF Latched=TRUE.")

    def _handle_reset_command(self, ch: int, auth_by: str, auth_id: str, corr_id: str):
        """Executes RESET command with staged restoration and 7 W / 12 W policy."""
        if ch < 1 or ch > 4:
            self.publish_command_status("RESET", False, ch, "INVALID_CHANNEL", corr_id)
            return

        # Verification of authorization metadata
        if not auth_id:
            self.publish_command_status("RESET", False, ch, "AUTHORIZATION_ID_REQUIRED", corr_id)
            return
        if not auth_by:
            self.publish_command_status("RESET", False, ch, "AUTHORIZED_BY_REQUIRED", corr_id)
            return

        with self.lock:
            state = self.channels[ch]
            target_power = self.active_power_targets.get(ch, 6.0)

            # Step 1: Main OFF, Aux OFF
            state["main_relay"] = False
            state["aux_relay"] = False

        # Simulate 250ms hardware stabilization window
        time.sleep(0.25)

        with self.lock:
            state = self.channels[ch]
            # Step 2: Main ON first
            state["main_relay"] = True
            state["aux_relay"] = False

            # Step 3: Measure active load power and apply authoritative policy
            if target_power <= 7.0:
                # Normal condition
                state["main_relay"] = True
                state["aux_relay"] = False
                state["status"] = "NORMAL"
                state["fault"] = None
                state["fault_latched"] = False
                state["load"] = True
                state["active_power"] = round(target_power, 2)
                i = round(target_power / (self.system_voltage * 0.96), 3)
                state["current"] = i
                state["apparent_power_va"] = round(self.system_voltage * i, 1)

                accepted = True
                reason = "CHANNEL_RESTORED_NORMAL"

            elif target_power <= 12.0:
                # High load condition: enable Aux relay assist
                state["main_relay"] = True
                state["aux_relay"] = True
                state["status"] = "HIGH LOAD"
                state["fault"] = None
                state["fault_latched"] = False
                state["load"] = True
                state["active_power"] = round(target_power, 2)
                i = round(target_power / (self.system_voltage * 0.96), 3)
                state["current"] = i
                state["apparent_power_va"] = round(self.system_voltage * i, 1)

                accepted = True
                reason = "CHANNEL_RESTORED_HIGH_LOAD_AUX_ON"

            else:
                # > 12 W: Load still in fault condition! Re-trip and keep latched
                state["main_relay"] = False
                state["aux_relay"] = False
                state["status"] = "TRIPPED"
                state["fault"] = "ACTIVE_POWER_OVER_12W"
                state["fault_latched"] = True
                state["load"] = False
                state["current"] = 0.0
                state["active_power"] = round(target_power, 2)
                state["apparent_power_va"] = 0.0

                accepted = False
                reason = "LOAD_STILL_OVER_12W"

        # Publish confirmation to smarttransformer/commands/status
        self.publish_command_status(
            command="RESET",
            accepted=accepted,
            channel=ch,
            reason=reason,
            correlation_id=corr_id
        )

        # Publish updated telemetry immediately
        self.publish_channel_telemetry(ch)
        print(f"[SIMULATOR] Channel {ch} RESET evaluated: accepted={accepted}, reason={reason}, status={state['status']}.")

    # ---------------------------------------------------------
    # MQTT PUBLISH METHODS
    # ---------------------------------------------------------
    def publish_status(self, status_val: str):
        if not self.client or not self.is_connected or self.simulated_offline:
            return
        payload = {
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "status": status_val,
            "device_id": self.device_id,
            "hardware_type": self.hardware_type,
            "device_mode": self.device_mode
        }
        self.client.publish(settings.MQTT_TOPIC_STATUS, json.dumps(payload), qos=1)

    def publish_heartbeat(self):
        if not self.client or not self.is_connected or self.simulated_offline:
            return
        payload = {
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "device_id": self.device_id,
            "uptime_sec": self.uptime_sec,
            "wifi_rssi": -52,
            "heap_free": 182048,
            "mqtt_connected": True,
            "hardware_type": "HARDWARE_SIMULATOR",
            "device_mode": "SIMULATOR",
            "telemetry_source": "SIMULATOR",
            "scenario": self.scenario
        }
        self.client.publish(settings.MQTT_TOPIC_HEARTBEAT, json.dumps(payload), qos=1)
        print("[SIM][MQTT] Publishing heartbeat")
        try:
            from backend.app.services.health_service import health_service
            health_service.record_device_heartbeat(
                device_id=self.device_id,
                device_mode="SIMULATOR",
                hardware_type="HARDWARE_SIMULATOR",
                uptime_sec=self.uptime_sec,
                mqtt_connected=True,
                scenario=self.scenario,
            )
        except Exception:
            pass

    def publish_system_telemetry(self):
        if not self.client or not self.is_connected or self.simulated_offline:
            return
        with self.lock:
            tot_p = sum(ch["active_power"] for ch in self.channels.values() if ch.get("active_power") is not None)
            tot_i = sum(ch["current"] for ch in self.channels.values() if ch.get("current") is not None)
            pf = 0.95
            v = self.system_voltage

        payload = {
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "voltage": round(v, 2),
            "current": round(tot_i, 3),
            "power": round(tot_p, 2),
            "energy": round(1.24 + (self.uptime_sec * 0.0001), 4),
            "frequency": 50.0,
            "power_factor": pf,
            "data_source": "SIMULATED HARDWARE",
            "device_id": self.device_id,
            "hardware_type": "HARDWARE_SIMULATOR",
            "device_mode": "SIMULATOR",
            "telemetry_source": "SIMULATOR"
        }
        self.client.publish(settings.MQTT_TOPIC_SYSTEM, json.dumps(payload), qos=1)
        print("[SIM][MQTT] Publishing system telemetry")

    def publish_channel_telemetry(self, ch: int):
        if not self.client or not self.is_connected or self.simulated_offline:
            return
        with self.lock:
            state = dict(self.channels[ch])

        state["timestamp"] = datetime.datetime.utcnow().isoformat()
        state["device_mode"] = "SIMULATOR"
        state["telemetry_source"] = "SIMULATOR"
        state["hardware_type"] = "HARDWARE_SIMULATOR"
        state["data_source"] = "SIMULATED HARDWARE"
        topic = f"smarttransformer/channel/{ch}"
        self.client.publish(topic, json.dumps(state), qos=1)
        print(f"[SIM][MQTT] Publishing CH{ch} telemetry")

    def publish_all_telemetry(self):
        self.publish_system_telemetry()
        for ch in range(1, 5):
            self.publish_channel_telemetry(ch)

    def publish_command_status(
        self,
        command: str,
        accepted: bool,
        channel: int,
        reason: str,
        correlation_id: str
    ):
        if not self.client or not self.is_connected or self.simulated_offline:
            return
        payload = {
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "command": command,
            "accepted": accepted,
            "channel": channel,
            "reason": reason,
            "correlation_id": correlation_id,
            "device_id": self.device_id,
            "device_mode": self.device_mode,
            "hardware_type": self.hardware_type
        }
        self.client.publish(settings.MQTT_TOPIC_COMMANDS_STATUS, json.dumps(payload), qos=1)
        print(f"[SIMULATOR COMMAND STATUS] Published to smarttransformer/commands/status: {payload}")

    # ---------------------------------------------------------
    # SIMULATOR CONTROLS: OFFLINE / ONLINE / RECONNECT
    # ---------------------------------------------------------
    def set_offline(self):
        """Simulates complete device offline event (stops heartbeat & telemetry)."""
        print("[SIMULATOR CONTROL] Setting simulator device OFFLINE...")
        self.simulated_offline = True
        if self.client and self.is_connected:
            self.publish_status("OFFLINE")
            try:
                self.client.disconnect()
            except Exception:
                pass
        self.is_connected = False

    def set_online(self):
        """Restores simulator device connection (reconnects, sends ONLINE, resumes telemetry)."""
        print("[SIMULATOR CONTROL] Restoring simulator device ONLINE...")
        self.simulated_offline = False
        if not self.is_connected:
            self._connect_client()

    # ---------------------------------------------------------
    # WORKER LOOP
    # ---------------------------------------------------------
    def _connect_client(self):
        try:
            print("[SIM] Starting simulator")
            print("[SIM][MQTT] Connecting to HiveMQ Cloud...")
            print(f"[SIM][MQTT] Host: {self.broker[:10]}...hivemq.cloud")
            print(f"[SIM][MQTT] Port: {self.port}")
            print(f"[SIM][MQTT] TLS: ENABLED")
            print(f"[SIM][MQTT] Username: {self.username}")
            print("[SIM][MQTT] Connecting...")
            self.client = mqtt.Client(
                client_id=f"gridguard-simulator-{int(time.time())}",
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2
            )
            self.client.username_pw_set(self.username, self.password)
            self.client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
            self.client.on_connect = self.on_connect
            self.client.on_disconnect = self.on_disconnect
            self.client.on_message = self.on_message
            self.client.connect(self.broker, self.port, 60)
            self.client.loop_start()
        except Exception as e:
            print(f"[SIM][MQTT] CONNECTION FAILED reason={e}")

    def _run_loop(self):
        self._connect_client()
        last_hb = 0.0
        last_telemetry = 0.0

        while self.is_running:
            now = time.time()
            self.uptime_sec += 1

            if not self.simulated_offline and self.is_connected:
                # Heartbeat every 5 seconds
                if now - last_hb >= 5.0:
                    self.publish_heartbeat()
                    last_hb = now

                # Telemetry every 2 seconds
                if now - last_telemetry >= 2.0:
                    self.publish_all_telemetry()
                    last_telemetry = now

            time.sleep(1.0)

        if self.client:
            try:
                self.publish_status("OFFLINE")
                self.client.loop_stop()
                self.client.disconnect()
            except Exception:
                pass

    def start(self):
        if self.is_running:
            return
        self.is_running = True
        self.simulated_offline = False
        self.worker_thread = threading.Thread(target=self._run_loop, daemon=True)
        self.worker_thread.start()
        print("[SIMULATOR] GRIDGUARD ESP32 Hardware Simulator started in background thread.")

    def stop(self):
        self.is_running = False
        if self.worker_thread:
            self.worker_thread.join(timeout=2.0)
        print("[SIMULATOR] GRIDGUARD ESP32 Hardware Simulator stopped.")

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock:
            return {
                "device_id": self.device_id,
                "hardware_type": self.hardware_type,
                "device_mode": self.device_mode,
                "is_connected": self.is_connected,
                "is_running": self.is_running,
                "simulated_offline": self.simulated_offline,
                "scenario": self.scenario,
                "uptime_sec": self.uptime_sec,
                "channels": {ch: dict(st) for ch, st in self.channels.items()}
            }


# Singleton simulator instance
hardware_simulator = ESP32HardwareSimulator()
