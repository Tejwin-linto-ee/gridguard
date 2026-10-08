import urllib.request
import json

try:
    with urllib.request.urlopen("http://127.0.0.1:1880/flows") as res:
        flows = json.loads(res.read().decode())
    print(f"Total deployed nodes in Node-RED: {len(flows)}")
    mqtt_nodes = [f for f in flows if "mqtt" in f.get("type", "")]
    print(f"MQTT nodes count: {len(mqtt_nodes)}")
    for f in mqtt_nodes:
        print(f"  Type: {f.get('type')} | Name: {f.get('name')} | Topic: {f.get('topic')} | Broker: {f.get('broker')}")
    
    http_nodes = [f for f in flows if "http request" in f.get("type", "")]
    print(f"\nHTTP Request nodes count: {len(http_nodes)}")
    for h in http_nodes:
        print(f"  Name: {h.get('name')} | URL: {h.get('url')} | Method: {h.get('method')}")

except Exception as e:
    print("Error querying Node-RED:", e)
