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

print("[*] Checking maia3-5m path...")
print(exec_cmd("proot-distro login ubuntu -- bash -l -c 'which maia3-5m || echo NOT FOUND'"))

print("[*] Checking maia3 install...")
print(exec_cmd("proot-distro login ubuntu -- bash -l -c 'pip3 show maia3 2>/dev/null || echo NOT INSTALLED'"))

print("[*] Checking cached model...")
print(exec_cmd("proot-distro login ubuntu -- bash -l -c 'ls -la ~/.cache/huggingface/hub/models--*Maia3* 2>/dev/null || echo NO CACHED MODEL'"))

print("[*] Checking server.log...")
print(exec_cmd("cat /data/data/com.termux/files/home/error.log"))

ssh.close()
