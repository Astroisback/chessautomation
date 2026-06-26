import paramiko
import os

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=10)

sftp = ssh.open_sftp()
# IMPORTANT: This is the directory the "Chess Bot" desktop launcher actually
# loads via `web-ext run --source-dir ~/chess_ext`. Uploading anywhere else
# (e.g. Desktop/ChessAutomata) has NO effect on what Firefox loads.
base_remote_path = "/data/data/com.termux/files/home/chess_ext"

try:
    sftp.mkdir(base_remote_path)
except Exception:
    pass

files_to_upload = [
    "manifest.json",
    "background.js",
    "content.js",
    "floating-panel.js",
    "popup.html",
    "popup.js",
    "popup.css"
]

print(f"[*] Uploading extension files to VPS ({base_remote_path})...")

for f in files_to_upload:
    local_path = os.path.join(r"y:\Chess Automata", f)
    remote_path = f"{base_remote_path}/{f}"
    if os.path.exists(local_path):
        sftp.put(local_path, remote_path)
        print(f"Uploaded {f}")

# Try to upload icons if they exist
try:
    sftp.mkdir(f"{base_remote_path}/icons")
except Exception:
    pass

for icon in ["icon16.png", "icon48.png", "icon128.png"]:
    local_icon = os.path.join(r"y:\Chess Automata\icons", icon)
    remote_icon = f"{base_remote_path}/icons/{icon}"
    if os.path.exists(local_icon):
        sftp.put(local_icon, remote_icon)
        print(f"Uploaded {icon}")

sftp.close()

# ── Reload Firefox so the updated extension actually loads ──
# The Chess Bot launcher runs `web-ext run ... --no-reload`, so file changes
# are NOT picked up live. We restart the `chessff` tmux session (same command
# the desktop shortcut uses) to relaunch Firefox with the new extension.
print("[*] Restarting Firefox (chessff session) to load the updated extension...")
H = "/data/data/com.termux/files/home"
restart_cmd = (
    "export PREFIX=/data/data/com.termux/files/usr; "
    "export PATH=$PREFIX/bin:$PATH; "
    "tmux kill-session -t chessff 2>/dev/null; "
    "sleep 1; "
    "tmux new-session -d -s chessff "
    "'DISPLAY=:1 web-ext run --source-dir " + H + "/chess_ext "
    "--firefox \"$(command -v firefox)\" --no-reload "
    "--firefox-profile " + H + "/chess_ff_profile "
    "--profile-create-if-missing --keep-profile-changes "
    "--start-url \"https://www.chess.com/play/online\" > " + H + "/chess_ff.log 2>&1'; "
    "sleep 2; tmux list-sessions"
)
stdin, stdout, stderr = ssh.exec_command(restart_cmd, timeout=60)
print(stdout.read().decode(errors="replace"))
err = stderr.read().decode(errors="replace")
if err.strip():
    print("[err]", err.strip())

ssh.close()
print("[+] Done! Extension updated in ~/chess_ext and Firefox relaunched on display :1.")

