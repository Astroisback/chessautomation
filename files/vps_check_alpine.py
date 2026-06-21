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

# Clean up ubuntu
print("[*] Cleaning up Ubuntu to free space...")
print(exec_cmd("proot-distro remove ubuntu || true"))

# Check for alpine
print("[*] Checking Alpine...")
print(exec_cmd("proot-distro login alpine -- apk search lc0 || true"))
print(exec_cmd("proot-distro login alpine -- apk search stockfish || true"))

ssh.close()
