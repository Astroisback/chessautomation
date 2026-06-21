import paramiko

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

print("[*] Tmux sessions:")
print(exec_cmd("tmux ls || true"))

print("[*] Tmux server logs:")
print(exec_cmd("tmux capture-pane -pt maiaserver || true"))

ssh.close()
