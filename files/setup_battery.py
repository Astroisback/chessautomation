"""
Native-style battery indicator for the XFCE top panel on the rooted Android/
Termux VPS.

Key facts learned the hard way:
  * The device is Android (Termux) + rooted (magisk). Only root can read
    /sys/class/power_supply, and Termux:API doesn't respond. So a small ROOT
    daemon writes the battery value to a world-readable cache file every 15s,
    and the panel plugin just reads that cache (NO `su` in the panel context).
  * Root's PATH has no Termux bin, so the daemon MUST be launched with the
    absolute path to bash (/data/.../usr/bin/bash).
  * xfce4-genmon-plugin 4.3.0 stores its config in XFCONF (/plugins/plugin-N/
    command, update-period, use-label) — NOT in the genmon-N.rc file. Writing
    the rc file is ignored and leaves the empty "genmon" placeholder.
"""
import paramiko, time

host = "100.86.25.112"; port = 8022; username = "u0_a191"; password = "ryzen9"
H = "/data/data/com.termux/files/home"
PREFIX = "/data/data/com.termux/files/usr"
CACHE = f"{PREFIX}/tmp/battery.txt"
BASH = f"{PREFIX}/bin/bash"          # root PATH lacks Termux bin
DAEMON = f"{H}/battery_daemon.sh"
GENMON = f"{H}/battery_genmon.sh"
AUTOSTART = f"{H}/.config/autostart/battery-daemon.desktop"
PLUGIN_ID = 19                        # free id (existing max was 18)

daemon_sh = (
    "#!/data/data/com.termux/files/usr/bin/bash\n"
    f"OUT={CACHE}\n"
    "while true; do\n"
    "  C=$(cat /sys/class/power_supply/battery/capacity 2>/dev/null)\n"
    "  S=$(cat /sys/class/power_supply/battery/status 2>/dev/null)\n"
    "  printf '%s\\n%s\\n' \"$C\" \"$S\" > \"$OUT\" 2>/dev/null\n"
    "  chmod 644 \"$OUT\" 2>/dev/null\n"
    "  sleep 15\n"
    "done\n"
)

genmon_sh = (
    "#!/data/data/com.termux/files/usr/bin/bash\n"
    f"F={CACHE}\n"
    "CAP=$(sed -n '1p' \"$F\" 2>/dev/null | tr -dc '0-9')\n"
    "ST=$(sed -n '2p' \"$F\" 2>/dev/null | tr -d '\\r\\n')\n"
    "[ -z \"$CAP\" ] && CAP=\"?\"\n"
    "[ -z \"$ST\" ] && ST=\"Unknown\"\n"
    "case \"$ST\" in\n"
    "  Charging) ICON=\"\u26a1\" ;;\n"
    "  Full)     ICON=\"\U0001F50C\" ;;\n"
    "  *)        ICON=\"\U0001F50B\" ;;\n"
    "esac\n"
    "COLOR=\"#e6e6e6\"\n"
    "if [ \"$CAP\" != \"?\" ] && [ \"$CAP\" -le 20 ] 2>/dev/null && [ \"$ST\" != \"Charging\" ] && [ \"$ST\" != \"Full\" ]; then COLOR=\"#ff5555\"; fi\n"
    "echo \"<txt> $ICON <span foreground='$COLOR'>${CAP}%</span> </txt>\"\n"
    "echo \"<tool>Battery: ${CAP}% - ${ST}</tool>\"\n"
)

autostart_desktop = (
    "[Desktop Entry]\n"
    "Type=Application\n"
    "Name=Battery Daemon\n"
    "Comment=Root battery reader for the panel indicator\n"
    f"Exec=/data/data/com.termux/files/usr/bin/bash -c \"tmux has-session -t battmon 2>/dev/null || tmux new-session -d -s battmon 'su -c \\\"{BASH} {DAEMON}\\\"'\"\n"
    "Terminal=false\n"
    "X-GNOME-Autostart-enabled=true\n"
)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=20)
sftp = ssh.open_sftp()

def run(cmd, t=60):
    i, o, e = ssh.exec_command(cmd, timeout=t)
    return o.read().decode(errors="replace") + e.read().decode(errors="replace")

def put(path, text):
    with sftp.open(path, "wb") as f:
        f.write(text.encode("utf-8"))

# Robust XFCE session env: newest dbus socket in $PREFIX/tmp + DISPLAY :1.
XENV = (
    "export PATH=/data/data/com.termux/files/usr/bin:$PATH; "
    "export DISPLAY=:1; "
    f"export DBUS_SESSION_BUS_ADDRESS=\"unix:path=$(ls -t {PREFIX}/tmp/dbus-* 2>/dev/null | head -1)\"; "
)

# 1) install genmon (no-op if already there)
print("[*] Ensuring xfce4-genmon-plugin is installed...")
print(run("export PATH=/data/data/com.termux/files/usr/bin:$PATH; "
          "pkg install -y xfce4-genmon-plugin 2>&1 | tail -3"))

# 2) write scripts + autostart
run(f"mkdir -p {H}/.config/autostart")
put(DAEMON, daemon_sh)
put(GENMON, genmon_sh)
put(AUTOSTART, autostart_desktop)
run(f"chmod +x {DAEMON} {GENMON}")
print("[+] Wrote daemon, genmon script, and autostart entry.")

# 3) start the root battery daemon now (absolute bash path!)
print("[*] Starting battery daemon (battmon)...")
print(run("export PATH=/data/data/com.termux/files/usr/bin:$PATH; "
          "tmux kill-session -t battmon 2>/dev/null; sleep 1; "
          f"tmux new-session -d -s battmon 'su -c \"{BASH} {DAEMON}\"'; "
          "sleep 3; tmux list-sessions 2>&1 | grep battmon"))
time.sleep(2)
print("[*] Cache:", run(f"cat {CACHE} 2>&1").strip())

# 4) register genmon in the top panel (panel-1) just before the clock (id 8)
#    This also forces the panel to spawn a genmon wrapper, which writes its
#    DEFAULT xfconf keys (empty command, 30s period, use-label=true). We then
#    overwrite those defaults below. Order is critical: configure AFTER the
#    plugin is in the panel, not before, or the wrapper will clobber us.
print("[*] Registering genmon plugin + ordering...")
print(run(XENV +
    f"xfconf-query -c xfce4-panel -p /plugins/plugin-{PLUGIN_ID} -n -t string -s genmon 2>&1; "
    "xfconf-query -c xfce4-panel -p /panels/panel-1/plugin-ids "
    "-t int -s 1 -t int -s 2 -t int -s 3 -t int -s 4 -t int -s 5 "
    f"-t int -s 6 -t int -s 7 -t int -s {PLUGIN_ID} -t int -s 8 -t int -s 9 -t int -s 10 2>&1; "
    "echo REG_DONE"))

# Give the panel a moment to spawn the wrapper and write its defaults.
print("[*] Waiting for panel to spawn genmon wrapper...")
time.sleep(4)

# 5) configure genmon via XFCONF (the format 4.3.0 actually reads). genmon
#    listens for xfconf changes, so NO PANEL RESTART is needed after this —
#    restarting here would re-spawn the wrapper which would clobber us again.
print("[*] Setting genmon command via xfconf (live, no panel restart)...")
print(run(XENV +
    f"xfconf-query -c xfce4-panel -p /plugins/plugin-{PLUGIN_ID}/command -n -t string -s '{GENMON}' 2>&1; "
    f"xfconf-query -c xfce4-panel -p /plugins/plugin-{PLUGIN_ID}/command -s '{GENMON}' 2>&1; "
    f"xfconf-query -c xfce4-panel -p /plugins/plugin-{PLUGIN_ID}/update-period -n -t int -s 15000 2>&1; "
    f"xfconf-query -c xfce4-panel -p /plugins/plugin-{PLUGIN_ID}/update-period -s 15000 2>&1; "
    f"xfconf-query -c xfce4-panel -p /plugins/plugin-{PLUGIN_ID}/use-label -n -t bool -s false 2>&1; "
    f"xfconf-query -c xfce4-panel -p /plugins/plugin-{PLUGIN_ID}/use-label -s false 2>&1; "
    "echo CFG_DONE"))

print("[*] Config readback:")
print(run(XENV + f"xfconf-query -c xfce4-panel -l -v 2>&1 | grep '/plugins/plugin-{PLUGIN_ID}'"))

sftp.close()
ssh.close()
print("[+] Done. Battery indicator updates every 15s; first reading may take a moment.")
