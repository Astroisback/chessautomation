import urllib.request
import json
import time

url = "http://100.86.25.112:8000/move"

def send_move(moves):
    data = {
        "moves": moves,
        "elo": 1100
    }
    req = urllib.request.Request(
        url, 
        data=json.dumps(data).encode("utf-8"), 
        headers={"Content-Type": "application/json"}
    )
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            result = json.loads(response.read().decode())
            print(f"Moves: {moves} -> Response: {result} (Took {time.time() - start:.2f}s)")
            return result
    except Exception as e:
        print(f"Moves: {moves} -> Error: {e} (Took {time.time() - start:.2f}s)")
        return None

print("[*] Sending Move 1...")
send_move(["e2e4"])

print("\n[*] Sending Move 2...")
send_move(["e2e4", "e7e5", "g1f3"])
