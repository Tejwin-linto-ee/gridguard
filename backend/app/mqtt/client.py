import json
import asyncio
import paho.mqtt.client as mqtt
from backend.app.core.config import settings

class MQTTClientManager:
    def __init__(self):
        self.client = None
        self.connected = False
        self.state = "MQTT_DISCONNECTED"  # MQTT_UNKNOWN, MQTT_CONNECTING, MQTT_CONNECTED, MQTT_DISCONNECTED, MQTT_ERROR
        self.telemetry_handler = None
        self.loop = None
        self.broker = settings.MQTT_HOST or settings.MQTT_BROKER
        self.port = settings.MQTT_PORT
        self.tls = settings.MQTT_TLS
        self.username = settings.MQTT_USERNAME
        self.password = settings.MQTT_PASSWORD

    def set_telemetry_handler(self, handler, loop=None):
        self.telemetry_handler = handler
        self.loop = loop

    def on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            self.connected = True
            self.state = "MQTT_CONNECTED"
            print(f"Connected to MQTT Broker: {self.broker}:{self.port}")
            client.subscribe(settings.MQTT_TOPIC_SYSTEM)
            client.subscribe(settings.MQTT_TOPIC_CHANNELS)
            client.subscribe(settings.MQTT_TOPIC_HEARTBEAT)
            client.subscribe(settings.MQTT_TOPIC_STATUS)
            client.subscribe(settings.MQTT_TOPIC_FAULTS)
            client.subscribe(settings.MQTT_TOPIC_EVENTS)
            client.subscribe(settings.MQTT_TOPIC_COMMANDS_STATUS)
        else:
            self.connected = False
            self.state = "MQTT_ERROR"
            print(f"MQTT Connection failed with return code {rc}")

    def on_disconnect(self, client, userdata, *args, **kwargs):
        self.connected = False
        self.state = "MQTT_DISCONNECTED"
        rc = args[0] if args else "unknown"
        print(f"Disconnected from MQTT broker (code {rc})")

    def on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())
            if self.telemetry_handler:
                if self.loop and self.loop.is_running():
                    if asyncio.iscoroutinefunction(self.telemetry_handler):
                        asyncio.run_coroutine_threadsafe(self.telemetry_handler(topic, payload), self.loop)
                    else:
                        self.loop.call_soon_threadsafe(self.telemetry_handler, topic, payload)
                else:
                    if asyncio.iscoroutinefunction(self.telemetry_handler):
                        asyncio.run(self.telemetry_handler(topic, payload))
                    else:
                        self.telemetry_handler(topic, payload)
        except Exception as e:
            print(f"Error handling MQTT message on {msg.topic}: {e}")

    def _connect_worker(self):
        try:
            self.state = "MQTT_CONNECTING"
            self.client = mqtt.Client(
                client_id=settings.MQTT_CLIENT_ID,
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2
            )
            if self.username and self.password:
                self.client.username_pw_set(self.username, self.password)
            if self.tls:
                import ssl
                self.client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
            self.client.on_connect = self.on_connect
            self.client.on_disconnect = self.on_disconnect
            self.client.on_message = self.on_message
            self.client.connect_async(self.broker, self.port, 60)
            self.client.loop_start()
        except Exception as e:
            self.connected = False
            self.state = "MQTT_DISCONNECTED"
            print(f"Notice: MQTT broker connection attempt: {e}. Running in autonomous edge mode.")

    def start(self):
        if settings.MQTT_AUTHORITATIVE_INGRESS == "NODERED":
            print(f"[MQTT ARCHITECTURE] Authoritative Ingress is Node-RED. FastAPI MQTT passive subscriber dormant.")
            return

        print("[MQTT] Initializing FastAPI MQTT Client for bidirectional command dispatch and health verification...")
        print(f"[MQTT] Host: {self.broker[:10]}...hivemq.cloud")
        print(f"[MQTT] Port: {self.port}")
        print(f"[MQTT] TLS: {'ENABLED' if self.tls else 'DISABLED'}")
        print(f"[MQTT] Username: {self.username}")
        print("[MQTT] Password: ********")
        import threading
        t = threading.Thread(target=self._connect_worker, daemon=True)
        t.start()

    def publish_command(self, topic: str, payload: dict) -> bool:
        if self.client and self.connected:
            info = self.client.publish(topic, json.dumps(payload), qos=1)
            print(f"[MQTT COMMAND DISPATCHED VIA CLIENT] Topic: {topic} | Payload: {payload}")
            return True
        else:
            # Fallback to direct single publication via paho.mqtt.publish
            try:
                import paho.mqtt.publish as publish
                auth = None
                if self.username and self.password:
                    auth = {"username": self.username, "password": self.password}
                tls_dict = None
                if self.tls:
                    import ssl
                    tls_dict = {"cert_reqs": ssl.CERT_REQUIRED}
                publish.single(
                    topic,
                    payload=json.dumps(payload),
                    qos=1,
                    hostname=self.broker,
                    port=self.port,
                    auth=auth,
                    tls=tls_dict
                )
                print(f"[MQTT COMMAND DISPATCHED VIA DIRECT PUBLISH] Topic: {topic} | Payload: {payload}")
                return True
            except Exception as e:
                print(f"[MQTT DISPATCH FAILED] Error dispatching to {topic}: {e}")
                return False

mqtt_manager = MQTTClientManager()
