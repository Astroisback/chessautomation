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

print("[*] Re-installing fastapi just in case...")
print(exec_cmd("proot-distro login ubuntu -- bash -l -c 'pip3 install fastapi uvicorn pydantic --break-system-packages'"))

print("[*] Starting server with nohup...")
cmd = "nohup proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -l -c 'cd /root && python3 server.py' > /data/data/com.termux/files/home/server.log 2>&1 &"
print(exec_cmd(cmd))

print("[*] Wait 4 seconds...")
time.sleep(4)

print("[*] Server log:")
print(exec_cmd("cat /data/data/com.termux/files/home/server.log"))

ssh.close()
