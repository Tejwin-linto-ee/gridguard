import urllib.request
import json
import time

BASE_URL = "http://127.0.0.1:8000/api"

endpoints = [
    ("GET", "/system/status", None),
    ("GET", "/channels", None),
    ("GET", "/channels/1", None),
    ("GET", "/system/measurements", None),
    ("GET", "/faults", None),
    ("GET", "/protection/events", None),
    ("GET", "/load-shedding/config", None),
    ("GET", "/load-shedding/events", None),
    ("GET", "/risk", None),
    ("GET", "/predictions", None),
    ("GET", "/classification/metrics", None),
    ("GET", "/maintenance", None),
    ("GET", "/notifications", None),
    ("GET", "/system/health", None),
    ("GET", "/audit-logs", None),
    ("POST", "/ai/analyze", {"query": "Assess electrical state"}),
    ("POST", "/telemetry/device-status", {"device": "ESP32-S3", "status": "ONLINE"}),
    ("POST", "/telemetry/system", {"voltage": 230.1, "current": 1.5, "power": 345.15, "frequency": 50.0, "power_factor": 0.95, "data_source": "LIVE MQTT"}),
    ("POST", "/telemetry/channels", {"channel": 1, "voltage": 230.1, "current": 1.5, "apparent_power": 345.15, "main_relay": True, "aux_relay": True, "load": True, "status": "NORMAL", "data_source": "LIVE MQTT"}),
]

print(f"{'METHOD':<6} | {'ENDPOINT':<32} | {'STATUS':<6} | {'TIME(ms)':<8} | {'RESPONSE SNIPPET'}")
print("-" * 85)

for method, path, body in endpoints:
    url = BASE_URL + path
    start = time.time()
    headers = {"Content-Type": "application/json"} if body else {}
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            elapsed = (time.time() - start) * 1000
            content = res.read().decode("utf-8")
            snippet = content[:50].replace("\n", "")
            print(f"{method:<6} | {path:<32} | {res.status:<6} | {elapsed:<8.1f} | {snippet}...")
    except urllib.error.HTTPError as e:
        elapsed = (time.time() - start) * 1000
        content = e.read().decode("utf-8")
        print(f"{method:<6} | {path:<32} | {e.code:<6} | {elapsed:<8.1f} | Error: {content[:50]}...")
    except Exception as e:
        print(f"{method:<6} | {path:<32} | {'FAIL':<6} | {'-':<8} | {str(e)[:50]}")
