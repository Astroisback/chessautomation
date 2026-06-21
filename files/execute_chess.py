import paramiko

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

print("[*] Connecting to VPS to start backend...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=15)

def exec_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode() + stderr.read().decode()
    print(out)
    return out

print("[*] Running 'chess' command...")
exec_cmd("/data/data/com.termux/files/usr/bin/chess")

print("[*] Checking tmux sessions...")
exec_cmd("tmux ls")

ssh.close()
