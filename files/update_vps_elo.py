#!/usr/bin/env python3
"""
Downloads all Maia models (1100-1900) and rewrites the chess server
to pick the correct model based on the 'elo' field in each request.
"""

import time

import paramiko

HOST = "100.86.25.112"
PORT = 8022
USER = "u0_a191"
PASS = "ryzen9"

MAIA_LEVELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]

# ── New server that routes by ELO ─────────────────────────────────────────────
SERVER_CODE = r'''#!/usr/bin/env python3
"""
Maia multi-ELO chess API server
POST /move  { moves: [...], color: "w"/"b", elo: 400-1900 }  ->  { move: "e2e4" }

Selects the closest Maia model (1100-1900) to the requested ELO.
Each model is lazily started and cached as a persistent subprocess.
"""
import os, shutil, subprocess, threading, chess
from flask import Flask, request, jsonify

app = Flask(__name__)

WEIGHTS_DIR = os.path.expanduser("~/maia_weights")
LC0         = shutil.which("lc0") or "/usr/local/bin/lc0"
LEVELS      = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]

# One lock + one process per ELO level
_engines  = {}   # { 1900: subprocess }
_locks    = { lvl: threading.Lock() for lvl in LEVELS }

def elo_to_level(elo):
    """Round requested ELO to the nearest available Maia model."""
    elo = max(LEVELS[0], min(LEVELS[-1], int(elo)))
    return min(LEVELS, key=lambda l: abs(l - elo))

def get_engine(level):
    """Return a running lc0 process for the given level, starting one if needed."""
    proc = _engines.get(level)
    if proc is None or proc.poll() is not None:
        weights = os.path.join(WEIGHTS_DIR, f"maia-{level}.pb")
        if not os.path.exists(weights):
            # Fallback to 1900 if the requested weights are missing
            weights = os.path.join(WEIGHTS_DIR, "maia-1900.pb")

        proc = subprocess.Popen(
            [LC0, f"--weights={weights}", "--backend=cpu"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, bufsize=1
        )
        # Handshake
        proc.stdin.write("uci\n")
        proc.stdin.flush()
        while True:
            if "uciok" in proc.stdout.readline():
                break

        _engines[level] = proc
        print(f"[Server] Started lc0 for maia-{level}")
    return proc

def ask_engine(level, moves):
    """Thread-safe: ask the correct lc0 process for the best move."""
    with _locks[level]:
        eng = get_engine(level)
        pos = ("position startpos moves " + " ".join(moves)) if moves else "position startpos"
        eng.stdin.write(pos + "\ngo nodes 1\n")
        eng.stdin.flush()
        while True:
            line = eng.stdout.readline().strip()
            if line.startswith("bestmove"):
                parts = line.split()
                return parts[1] if len(parts) > 1 and parts[1] != "(none)" else None

@app.route("/move", methods=["POST"])
def get_move():
    data   = request.get_json(force=True) or {}
    moves  = data.get("moves", [])
    elo    = data.get("elo", 1900)
    level  = elo_to_level(elo)

    # Validate moves
    board, valid = chess.Board(), []
    for m in moves:
        try:
            board.push_uci(m)
            valid.append(m)
        except Exception:
            break

    move = ask_engine(level, valid)
    if not move:
        move = next(iter(board.legal_moves)).uci() if board.legal_moves else None

    print(f"[Server] elo={elo} -> maia-{level} -> {move}  (history: {len(valid)} moves)")
    return jsonify({"move": move})

@app.route("/health")
def health():
    loaded = [lvl for lvl, p in _engines.items() if p and p.poll() is None]
    return jsonify({"status": "ok", "loaded_models": sorted(loaded), "lc0": LC0})

if __name__ == "__main__":
    print(f"Maia multi-ELO server starting on :8000  (lc0={LC0})")
    print(f"Weights dir: {WEIGHTS_DIR}")
    app.run(host="0.0.0.0", port=8000, threaded=True)
'''


# ── SSH helpers ───────────────────────────────────────────────────────────────
def run(client, cmd, timeout=60):
    print(f"\n$ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    if out.strip():
        print(out.strip())
    if err.strip():
        print("[err]", err.strip())
    return out.strip()


def main():
    print("Connecting …")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=20)
    print("Connected!\n")

    # 1. Kill old server
    print("=" * 55)
    print("STEP 1: Stopping existing server")
    run(client, "tmux kill-session -t chess 2>/dev/null; sleep 1; echo done")
    run(client, "pkill -f chess_server 2>/dev/null; sleep 1; echo cleared")

    # 2. Download any missing Maia weights
    print("\n" + "=" * 55)
    print("STEP 2: Downloading missing Maia models")
    run(client, "mkdir -p ~/maia_weights")

    for lvl in MAIA_LEVELS:
        pb = f"~/maia_weights/maia-{lvl}.pb"
        check = run(client, f"test -f {pb} && echo EXISTS || echo MISSING")
        if "MISSING" in check:
            print(f"  Downloading maia-{lvl} …")
            run(
                client,
                f"wget -q 'https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-{lvl}.pb.gz' "
                f"-O ~/maia_weights/maia-{lvl}.pb.gz && "
                f"gunzip -f ~/maia_weights/maia-{lvl}.pb.gz && echo 'OK maia-{lvl}'",
                timeout=120,
            )
        else:
            print(f"  maia-{lvl}: already present")

    run(client, "ls -lh ~/maia_weights/")

    # 3. Write new server
    print("\n" + "=" * 55)
    print("STEP 3: Writing updated server")
    home = run(client, "echo $HOME").strip()
    remote_path = f"{home}/chess_server.py"

    sftp = client.open_sftp()
    with sftp.open(remote_path, "w") as f:
        f.write(SERVER_CODE)
    sftp.close()
    run(client, f"chmod +x {remote_path}")
    print(f"Written to {remote_path}")

    # 4. Start in tmux
    print("\n" + "=" * 55)
    print("STEP 4: Starting server")
    run(
        client,
        f"tmux new-session -d -s chess 'python3 {remote_path} 2>&1 | tee ~/chess_server.log'",
    )
    time.sleep(5)

    # 5. Verify
    print("\n" + "=" * 55)
    print("STEP 5: Verifying")
    run(client, "cat ~/chess_server.log | head -10")
    run(client, "curl -s http://localhost:8000/health")

    # Quick smoke test with elo=1500 (should load maia-1500)
    run(
        client,
        "curl -s -X POST http://localhost:8000/move "
        '-H "Content-Type: application/json" '
        '-d \'{"moves":[],"color":"w","elo":1500}\' ',
    )

    run(client, "curl -s http://localhost:8000/health")

    client.close()
    print("\n✅ Done! Server now routes by ELO (1100-1900).")


if __name__ == "__main__":
    main()
