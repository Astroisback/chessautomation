import paramiko

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

print("[*] Connecting to VPS to create 'chess' command...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=15)

def exec_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode() + stderr.read().decode()

chess_script = """#!/data/data/com.termux/files/usr/bin/bash
echo "[*] Killing old Maia-3 service..."
tmux kill-session -t maiaserver 2>/dev/null || true
pkill -f "python3 server.py" 2>/dev/null || true
sleep 1
echo "[*] Starting new Maia-3 service..."
tmux new-session -d -s maiaserver 'proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -l -c "cd /root && python3 server.py"'
echo "[+] Service started in tmux session 'maiaserver'."
"""

exec_cmd(f"cat << 'EOF' > /data/data/com.termux/files/usr/bin/chess\n{chess_script}\nEOF")
exec_cmd("chmod +x /data/data/com.termux/files/usr/bin/chess")

print("[+] Created 'chess' command successfully!")
ssh.close()
