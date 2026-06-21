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

print("[*] Killing old python servers...")
exec_cmd("killall python3")
exec_cmd("killall python")
exec_cmd("fuser -k 8000/tcp")
time.sleep(1)

print("[*] Restarting native Termux server...")
exec_cmd("tmux kill-session -t chessserver || true")
exec_cmd("tmux new-session -d -s chessserver 'python termux_server.py > server.log 2>&1'")
time.sleep(3)

print("[*] Server log:")
print(exec_cmd("cat /data/data/com.termux/files/home/server.log"))

ssh.close()
