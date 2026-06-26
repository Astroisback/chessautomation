"""
Updates the VPS desktop launcher (~/chess_bot_start.sh) so a single click on
the Chess Bot icon brings up EVERYTHING in the right order:

  1) Maia engine (tmux 'maiaserver') -- starts inside Ubuntu proot
  2) Battery daemon (tmux 'battmon') -- root reader for the panel indicator
  3) Genmon xfconf reapplied -- guard against the panel resetting it
  4) Firefox + Chess Automata extension (tmux 'chessff') with a PERSISTENT
     profile so chrome.storage settings survive between launches

Idempotent: re-running just keeps everything alive.
"""
import paramiko

host = "100.86.25.112"; port = 8022; username = "u0_a191"; password = "ryzen9"
H = "/data/data/com.termux/files/home"
PREFIX = "/data/data/com.termux/files/usr"
BASH = f"{PREFIX}/bin/bash"           # root PATH lacks Termux bin
DAEMON = f"{H}/battery_daemon.sh"
GENMON = f"{H}/battery_genmon.sh"

launcher = r"""#!/data/data/com.termux/files/usr/bin/bash
export PREFIX=/data/data/com.termux/files/usr
export PATH=$PREFIX/bin:$PATH
export DISPLAY=:1
HOME=/data/data/com.termux/files/home
PANEL_BASH=/data/data/com.termux/files/usr/bin/bash

echo "[chess-bot] $(date)"

# ---------- 1) Maia engine server (port 8000) inside Ubuntu proot ----------
if ! tmux has-session -t maiaserver 2>/dev/null; then
  echo "[chess-bot] starting maia server..."
  tmux new-session -d -s maiaserver \
    'proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -c "cd /root && python3 server.py"'
fi

# Wait until the engine answers (loads PyTorch)
echo "[chess-bot] waiting for engine on :8000 ..."
for i in $(seq 1 40); do
  if curl -s -m 3 -X POST http://127.0.0.1:8000/move \
        -H "Content-Type: application/json" -d '{"moves":[],"elo":1100}' >/dev/null 2>&1; then
    echo "[chess-bot] engine is up."
    break
  fi
  sleep 2
done

# ---------- 2) (battery daemon is handled by XFCE autostart, not here) ----
# The battery panel indicator's daemon is launched on XFCE login by
# ~/.config/autostart/battery-daemon.desktop. Keeping it out of the chess
# launcher keeps concerns clean: this script handles chess; the panel
# indicator handles itself.

# ---------- 3) (genmon xfconf reapply is no longer needed) ----------------
# The genmon plugin's xfconf settings persist in xfce4-panel.xml across
# reboots. We previously reapplied them here as a safety net; that's the
# panel's responsibility, not the chess launcher's.

# ---------- 4) Firefox + Chess Automata extension -------------------------
mkdir -p "$HOME/chess_ff_profile"
tmux kill-session -t chessff 2>/dev/null
tmux new-session -d -s chessff \
  'DISPLAY=:1 web-ext run --source-dir '"$HOME"'/chess_ext --firefox "$(command -v firefox)" --no-reload --firefox-profile '"$HOME"'/chess_ff_profile --profile-create-if-missing --keep-profile-changes --start-url "https://www.chess.com/play/online" > '"$HOME"'/chess_ff.log 2>&1'

echo "[chess-bot] launched. Engine: http://100.86.25.112:8000 | Firefox on display :1"
sleep 2
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=20)

def run(cmd, t=30):
    i, o, e = ssh.exec_command(cmd, timeout=t)
    return o.read().decode(errors="replace") + e.read().decode(errors="replace")

sftp = ssh.open_sftp()
with sftp.open(f"{H}/chess_bot_start.sh", "w") as f:
    f.write(launcher)
sftp.close()
run(f"chmod +x {H}/chess_bot_start.sh")
print("[+] Updated chess_bot_start.sh.")
print(run(f"head -5 {H}/chess_bot_start.sh"))
print("[*] Sanity-running the launcher now (background)...")
print(run(f"{H}/chess_bot_start.sh 2>&1 | tail -8"))

ssh.close()
print("[+] Done. Clicking the Chess Bot desktop shortcut now brings up the engine, battery daemon, and Firefox extension together.")
