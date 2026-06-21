import paramiko
import time

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

print("[*] Connecting to VPS...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=15)

def exec_cmd(cmd, show=True):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode() + stderr.read().decode()
    if show and out.strip():
        print(f"    {out.strip()}")
    return out.strip()

# ============================================================
# 1. Create the boot script for Termux:Boot
# ============================================================
print("[*] Setting up auto-start on boot...")

# Create ~/.termux/boot/ directory
exec_cmd("mkdir -p ~/.termux/boot")

# Write the boot script
# This script will:
# 1. Wait a few seconds for the system to settle
# 2. Kill any existing server
# 3. Start the Maia-3 server in a tmux session
boot_script = """#!/data/data/com.termux/files/usr/bin/bash
# Chess Automata - Auto-start Maia-3 server on boot
# This script is run by Termux:Boot when the device starts

# Wait for system to settle
sleep 10

# Acquire a wakelock so the server doesn't get killed by Android
termux-wake-lock

# Kill any existing server
tmux kill-session -t maiaserver 2>/dev/null || true
pkill -f "python3 server.py" 2>/dev/null || true

# Give processes time to die
sleep 2

# Start the server in a tmux session
tmux new-session -d -s maiaserver 'proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -l -c "cd /root && python3 server.py"'

# Log the start
echo "$(date): Maia-3 server started via Termux:Boot" >> /data/data/com.termux/files/home/boot.log
"""

exec_cmd(f"cat << 'BOOTEOF' > ~/.termux/boot/start_maia3.sh\n{boot_script}\nBOOTEOF")
exec_cmd("chmod +x ~/.termux/boot/start_maia3.sh")
print("[+] Boot script created: ~/.termux/boot/start_maia3.sh")

# ============================================================
# 2. Also set up .bashrc auto-start as a fallback
# ============================================================
print("[*] Setting up .bashrc fallback auto-start...")

# Check if the auto-start line is already in .bashrc
bashrc_content = exec_cmd("cat ~/.bashrc 2>/dev/null", show=False)

bashrc_line = '# Auto-start Maia-3 server if not running'
if bashrc_line not in bashrc_content:
    bashrc_addition = """
# Auto-start Maia-3 server if not running
if ! tmux has-session -t maiaserver 2>/dev/null; then
    echo "[*] Starting Maia-3 server..."
    tmux new-session -d -s maiaserver 'proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -l -c "cd /root && python3 server.py"'
    echo "[+] Maia-3 server started in tmux session 'maiaserver'"
fi
"""
    exec_cmd(f"cat << 'BASHEOF' >> ~/.bashrc\n{bashrc_addition}\nBASHEOF")
    print("[+] .bashrc auto-start added (fallback)")
else:
    print("[=] .bashrc auto-start already exists, skipping")

# ============================================================
# 3. Set up a cron job as a watchdog (restarts if crashed)
# ============================================================
print("[*] Setting up cron watchdog (restarts server if it crashes)...")

watchdog_script = """#!/data/data/com.termux/files/usr/bin/bash
# Watchdog: restart Maia-3 server if it's not running
if ! tmux has-session -t maiaserver 2>/dev/null; then
    echo "$(date): Watchdog restarting Maia-3 server" >> /data/data/com.termux/files/home/watchdog.log
    tmux new-session -d -s maiaserver 'proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -l -c "cd /root && python3 server.py"'
fi
"""

exec_cmd(f"cat << 'WATCHEOF' > ~/watchdog_maia.sh\n{watchdog_script}\nWATCHEOF")
exec_cmd("chmod +x ~/watchdog_maia.sh")

# Install crond if not available
exec_cmd("which crond >/dev/null 2>&1 || pkg install -y cronie", show=False)

# Add cron job: check every 5 minutes
cron_line = "*/5 * * * * /data/data/com.termux/files/home/watchdog_maia.sh"
existing_cron = exec_cmd("crontab -l 2>/dev/null", show=False)

if "watchdog_maia" not in existing_cron:
    if existing_cron:
        new_cron = existing_cron + "\n" + cron_line + "\n"
    else:
        new_cron = cron_line + "\n"
    exec_cmd(f"echo '{cron_line}' | crontab -")
    print("[+] Cron watchdog added: checks every 5 minutes")
else:
    print("[=] Cron watchdog already exists, skipping")

# Start crond if not running
exec_cmd("crond 2>/dev/null || true", show=False)

# ============================================================
# 4. Verify everything is in place
# ============================================================
print("\n[*] Verifying setup...")
print("  Boot script:")
exec_cmd("ls -la ~/.termux/boot/start_maia3.sh")
print("  Cron jobs:")
exec_cmd("crontab -l 2>/dev/null")
print("  Current tmux sessions:")
exec_cmd("tmux list-sessions 2>/dev/null || echo '  (none running)'")

# ============================================================
# 5. Make sure server is running right now
# ============================================================
print("\n[*] Ensuring server is running now...")
tmux_check = exec_cmd("tmux has-session -t maiaserver 2>&1 && echo 'RUNNING' || echo 'NOT_RUNNING'", show=False)

if "NOT_RUNNING" in tmux_check:
    print("[*] Server not running, starting it...")
    exec_cmd("tmux kill-session -t maiaserver 2>/dev/null || true", show=False)
    exec_cmd("pkill -f 'python3 server.py' 2>/dev/null || true", show=False)
    time.sleep(1)
    exec_cmd("tmux new-session -d -s maiaserver 'proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -l -c \"cd /root && python3 server.py\"'")
    print("[*] Waiting for server to initialize...")
    time.sleep(5)

# Verify server responds
import urllib.request
import json

try:
    req = urllib.request.Request(
        f"http://{host}:8000/move",
        data=json.dumps({"moves": [], "elo": 1100}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode())
        print(f"[+] Server responding! Test move: {result.get('move', 'N/A')}")
except Exception as e:
    print(f"[!] Server not responding yet: {e}")
    print("    It may still be loading PyTorch. Try again in 30 seconds.")

ssh.close()

print("\n" + "=" * 50)
print(" AUTO-START SETUP COMPLETE")
print("=" * 50)
print("""
Three layers of protection:

1. Termux:Boot  → Starts server when phone boots
                   (requires Termux:Boot app from F-Droid)

2. .bashrc      → Starts server when you open Termux

3. Cron watchdog → Checks every 5 min, restarts if crashed

The server will now survive:
  ✓ Phone reboots
  ✓ Termux app restarts
  ✓ Server crashes
  ✓ Process kills
""")
