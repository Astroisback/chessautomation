import paramiko

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    ssh.connect(host, port, username, password, timeout=10)
    stdin, stdout, stderr = ssh.exec_command("df -h /data")
    print("STDOUT:")
    print(stdout.read().decode())
finally:
    ssh.close()
