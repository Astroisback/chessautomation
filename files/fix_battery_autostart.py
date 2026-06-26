"""
Fix the XFCE autostart entry so the battery daemon comes up automatically on
login as root (via setsid+su, not the broken tmux+su pattern), and verify
nothing else is missing for boot persistence.
"""
import paramiko
s=paramiko.SSHClient(); s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('100.86.25.112',8022,'u0_a191','ryzen9',timeout=20)
sftp=s.open_sftp()
def r(c,t=20):
    i,o,e=s.exec_command(c,timeout=t); return o.read().decode('utf-8','replace')+e.read().decode('utf-8','replace')
H="/data/data/com.termux/files/home"
PREFIX="/data/data/com.termux/files/usr"
BASH=f"{PREFIX}/bin/bash"
DAEMON=f"{H}/battery_daemon.sh"
LOG=f"{PREFIX}/tmp/battery_daemon.log"
AUTOSTART=f"{H}/.config/autostart/battery-daemon.desktop"

# Use a small wrapper script so we can keep the .desktop Exec= simple.
# The wrapper is idempotent: if a daemon is already running, it exits.
WRAPPER=f"{H}/start_battery_daemon.sh"
wrapper_sh = f"""#!{BASH}
# Auto-start the battery sysfs reader as root.
# `su` in a detached tmux session does NOT elevate on this device (magisk
# policy); the working pattern is `nohup setsid su -c "..." &` from a
# user-session context, which is what an XFCE autostart entry gives us.
# nohup makes sure the child survives SIGHUP when its parent (the autostart
# launcher) exits.
# Anchor the pgrep pattern with a leading slash so we don't self-match the
# wrapper (start_battery_daemon.sh contains "battery_daemon.sh" as a
# substring, which previously caused this script to always exit early).
if pgrep -f '/battery_daemon\\.sh' >/dev/null 2>&1; then
  exit 0
fi
nohup setsid su -c "{BASH} {DAEMON}" </dev/null >>{LOG} 2>&1 &
disown
"""

autostart = f"""[Desktop Entry]
Type=Application
Name=Battery Daemon
Comment=Root battery reader for the XFCE panel indicator
Exec={BASH} {WRAPPER}
Terminal=false
X-GNOME-Autostart-enabled=true
"""

with sftp.open(WRAPPER, "wb") as f: f.write(wrapper_sh.encode("utf-8"))
r(f"chmod +x {WRAPPER}")
print("[+] Wrote wrapper:", WRAPPER, flush=True)

with sftp.open(AUTOSTART, "wb") as f: f.write(autostart.encode("utf-8"))
print("[+] Updated autostart entry.", flush=True)
print(r(f"cat {AUTOSTART}"), flush=True)

# Sanity-run the wrapper now to confirm it works (no-op if daemon already up).
print("=== test the wrapper now ===", flush=True)
print(r(f"{BASH} {WRAPPER}; sleep 2; ps -ef 2>/dev/null | grep -E '[b]attery_daemon' | head"), flush=True)

sftp.close(); s.close()
print("[+] Done. On reboot, XFCE will launch the wrapper, which elevates "
      "via setsid+su and starts the battery daemon as root.")
