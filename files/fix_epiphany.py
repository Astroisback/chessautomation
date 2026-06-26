import paramiko
import sys
import time
import base64

host = '74.225.165.1'
user = 'gojo'
password = 'Ryzen@120watt'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    print("Connecting...")
    ssh.connect(host, username=user, password=password, timeout=10)
    
    def run_cmd(cmd):
        stdin, stdout, stderr = ssh.exec_command(cmd)
        return stdout.read().decode('utf-8').strip(), stderr.read().decode('utf-8').strip()

    # 1. Kill old epiphany
    run_cmd("pkill -9 epiphany")
    time.sleep(1)

    # 2. Launch with sandbox disabled
    print("Launching Epiphany with sandbox disabled...")
    
    script = """#!/bin/bash
XFCE_PID=$(pgrep -u gojo xfce4-session | head -1)
if [ -n "$XFCE_PID" ]; then
    eval $(cat /proc/$XFCE_PID/environ 2>/dev/null | tr '\\0' '\\n' | grep -E '^(DISPLAY|XAUTHORITY|DBUS)' | sed 's/^/export /')
fi
export DISPLAY=${DISPLAY:-:10.0}
export XAUTHORITY=${XAUTHORITY:-/home/gojo/.Xauthority}
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
export WEBKIT_FORCE_SANDBOX=0

nohup epiphany-browser "https://google.com" > /tmp/epi.log 2>&1 &
"""
    run_cmd(f"echo '{base64.b64encode(script.encode()).decode()}' | base64 -d > /tmp/launch_epi.sh && chmod +x /tmp/launch_epi.sh")
    run_cmd("bash /tmp/launch_epi.sh")
    
    # 3. Create desktop shortcut
    desktop = """[Desktop Entry]
Version=1.0
Name=Epiphany Web Browser (Working)
Comment=Browse the Web
Exec=env WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 epiphany-browser %U
Terminal=false
Type=Application
Icon=org.gnome.Epiphany
Categories=Network;WebBrowser;
"""
    run_cmd(f"echo '{base64.b64encode(desktop.encode()).decode()}' | base64 -d > ~/Desktop/epiphany.desktop && chmod +x ~/Desktop/epiphany.desktop")
    
    print("Done! Check your RDP screen.")
    
except Exception as e:
    print(e)
finally:
    ssh.close()
