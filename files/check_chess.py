import paramiko

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

try:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port, username, password, timeout=10)
    
    stdin, stdout, stderr = ssh.exec_command('proot-distro login ubuntu -- python3 -c "import chess; print(chess.__version__)"')
    print("STDOUT:", stdout.read().decode())
    print("STDERR:", stderr.read().decode())
    
    ssh.close()
except Exception as e:
    print(f"Error: {e}")
