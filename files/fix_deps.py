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

print("[*] Installing fastapi with python3 -m pip...")
print(exec_cmd("proot-distro login ubuntu -- bash -c 'python3 -m pip install fastapi uvicorn pydantic --break-system-packages'"))

print("[*] Checking fastapi module...")
print(exec_cmd("proot-distro login ubuntu -- bash -c 'python3 -c \"import fastapi; print(fastapi.__file__)\"'"))

ssh.close()
