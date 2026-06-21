import paramiko
import time

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=10)

def exec_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode() + stderr.read().decode()

print("[*] Creating robust start.sh with logging...")
start_sh = "cat << 'EOF' > start.sh\nproot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -l -c 'cd /root && python3 server.py' > error.log 2>&1\nEOF\n"
exec_cmd(start_sh)

print("[*] Launching via tmux...")
exec_cmd("tmux kill-session -t maiaserver || true")
exec_cmd("tmux new-session -d -s maiaserver 'bash start.sh'")

print("[*] Waiting for server to boot...")
time.sleep(3)

print("[*] Checking error.log...")
print(exec_cmd("cat error.log"))

ssh.close()
