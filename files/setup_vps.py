#!/usr/bin/env python3
"""
Connects to the VPS via SSH and installs/upgrades the Maia chess server
to use maia-1900 (highest available ELO).
"""

import sys
import time

import paramiko

HOST = "100.86.25.112"
PORT = 8022
USER = "u0_a191"
PASS = "ryzen9"

# ── helpers ────────────────────────────────────────────────────────────────────


def run(client, cmd, timeout=60):
    print(f"\n$ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    if out.strip():
        print(out.strip())
    if err.strip():
        print("[err]", err.strip())
    return out.strip(), err.strip()


def run_long(client, cmd, timeout=300):
    """For slow commands like downloads/installs."""
    return run(client, cmd, timeout=timeout)


# ── new server script ──────────────────────────────────────────────────────────

SERVER_CODE = r'''#!/usr/bin/env python3
"""Maia-1900 chess API server — POST /move {moves, color, accuracy} -> {move}"""
import subprocess, chess, threading
from flask import Flask, request, jsonify

app = Flask(__name__)
_engine_lock = threading.Lock()

# Locate lc0 and weights
import shutil, os
LC0 = shutil.which("lc0") or "/usr/local/bin/lc0" or "./lc0"
WEIGHTS = os.path.expanduser("~/maia_weights/maia-1900.pb")

_engine_proc = None

def get_engine():
    global _engine_proc
    if _engine_proc is None or _engine_proc.poll() is not None:
        _engine_proc = subprocess.Popen(
            [LC0, f"--weights={WEIGHTS}", "--backend=cpu"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, bufsize=1
        )
        # Init UCI
        _engine_proc.stdin.write("uci\n")
        _engine_proc.stdin.flush()
        while True:
            line = _engine_proc.stdout.readline()
            if "uciok" in line:
                break
    return _engine_proc

def ask_engine(moves):
    with _engine_lock:
        eng = get_engine()
        # Build position command
        if moves:
            pos = "position startpos moves " + " ".join(moves)
        else:
            pos = "position startpos"
        eng.stdin.write(pos + "\n")
        eng.stdin.write("go nodes 1\n")
        eng.stdin.flush()
        best = None
        while True:
            line = eng.stdout.readline().strip()
            if line.startswith("bestmove"):
                parts = line.split()
                best = parts[1] if len(parts) > 1 else None
                break
        return best

@app.route("/move", methods=["POST"])
def get_move():
    data = request.get_json(force=True) or {}
    moves = data.get("moves", [])
    # Validate move list against a board to avoid crashing lc0
    board = chess.Board()
    valid = []
    for m in moves:
        try:
            board.push_uci(m)
            valid.append(m)
        except Exception:
            break
    move = ask_engine(valid)
    if not move or move == "(none)":
        # Fallback: first legal move
        move = next(iter(board.legal_moves)).uci() if board.legal_moves else None
    return jsonify({"move": move})

@app.route("/health")
def health():
    return jsonify({"status": "ok", "model": "maia-1900"})

if __name__ == "__main__":
    print(f"Starting Maia-1900 server on :8000  (lc0={LC0}, weights={WEIGHTS})")
    app.run(host="0.0.0.0", port=8000, threaded=False)
'''

# ── main ───────────────────────────────────────────────────────────────────────


def main():
    print("Connecting to VPS …")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=20)
    print("Connected!\n")

    # ── 1. probe ──────────────────────────────────────────────────────────────
    print("=" * 60)
    print("STEP 1: Probing system")
    print("=" * 60)

    run(client, "echo $HOME && uname -a")
    run(client, "which lc0 || find /usr /opt ~ -name lc0 -type f 2>/dev/null | head -5")
    run(client, "which python3 && python3 --version")
    run(client, "pip3 show flask chess 2>/dev/null | grep -E 'Name|Version'")

    # ── 2. kill existing server ────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 2: Stopping existing server")
    print("=" * 60)

    run(
        client,
        "pkill -f 'python.*server\\|python.*maia\\|python.*chess\\|uvicorn\\|gunicorn' 2>/dev/null; sleep 1; echo done",
    )
    run(client, "fuser -k 8000/tcp 2>/dev/null; sleep 1; echo port cleared")

    # ── 3. install dependencies ────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 3: Installing Python deps")
    print("=" * 60)

    run_long(client, "pip3 install flask chess --quiet 2>&1 | tail -5")

    # ── 4. install lc0 if missing ──────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 4: Ensuring lc0 is installed")
    print("=" * 60)

    lc0_check, _ = run(client, "which lc0 2>/dev/null || echo MISSING")
    if "MISSING" in lc0_check:
        print("lc0 not found, installing …")
        run_long(
            client,
            "apt-get install -y lc0 2>&1 | tail -10 || pkg install lc0 -y 2>&1 | tail -10 || echo 'apt/pkg failed'",
        )
        lc0_check2, _ = run(client, "which lc0 2>/dev/null || echo MISSING")
        if "MISSING" in lc0_check2:
            print("Trying pip lczero fallback …")
            run_long(client, "pip3 install lczero 2>&1 | tail -5")
    else:
        print(f"lc0 found at: {lc0_check}")

    # ── 5. download maia-1900 weights ──────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 5: Downloading maia-1900 weights")
    print("=" * 60)

    run(client, "mkdir -p ~/maia_weights")
    weights_check, _ = run(
        client, "test -f ~/maia_weights/maia-1900.pb && echo EXISTS || echo MISSING"
    )

    if "MISSING" in weights_check:
        print("Downloading maia-1900.pb.gz from GitHub …")
        run_long(
            client,
            "wget -q --show-progress "
            "'https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1900.pb.gz' "
            "-O ~/maia_weights/maia-1900.pb.gz 2>&1 && "
            "gunzip -f ~/maia_weights/maia-1900.pb.gz && "
            "echo 'Download complete'",
            timeout=180,
        )
    else:
        print("maia-1900.pb already present, skipping download.")

    run(client, "ls -lh ~/maia_weights/")

    # ── 6. write new server ────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 6: Writing new server script")
    print("=" * 60)

    # Use sftp to upload the file cleanly
    sftp = client.open_sftp()
    import os

    remote_path = "/data/data/com.termux/files/home/chess_server.py"
    # Try to find actual home first
    home_out, _ = run(client, "echo $HOME")
    home = home_out.strip() or "/data/data/com.termux/files/home"
    remote_path = f"{home}/chess_server.py"

    with sftp.open(remote_path, "w") as f:
        f.write(SERVER_CODE)
    sftp.close()
    print(f"Wrote server to {remote_path}")
    run(client, f"chmod +x {remote_path}")

    # ── 7. start server in tmux ────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 7: Starting server in tmux")
    print("=" * 60)

    run(
        client,
        "tmux kill-session -t chess 2>/dev/null; sleep 1; echo old session cleared",
    )
    run(
        client,
        f"tmux new-session -d -s chess 'python3 {remote_path} 2>&1 | tee ~/chess_server.log'; sleep 3; echo launched",
    )

    # ── 8. verify ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 8: Verifying server started")
    print("=" * 60)

    time.sleep(4)
    run(client, "cat ~/chess_server.log 2>/dev/null | head -20")
    run(
        client,
        "curl -s http://localhost:8000/health 2>/dev/null || echo 'health check failed'",
    )
    run(client, "tmux list-sessions")

    client.close()
    print("\n✅ Done! Server should be running with maia-1900 on port 8000.")


if __name__ == "__main__":
    main()
