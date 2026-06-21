import urllib.request
import json

url = "http://100.86.25.112:8000/move"
data = {
    "moves": ["e2e4"],
    "color": "white",
    "accuracy": 100
}

req = urllib.request.Request(
    url, 
    data=json.dumps(data).encode("utf-8"), 
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req, timeout=15) as response:
        result = json.loads(response.read().decode())
        print(f"API Response: {result}")
except Exception as e:
    print(f"API Error: {e}")
