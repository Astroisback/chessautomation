import paramiko
import time
import sys

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

try:
    print(f"[*] Connecting to Android VPS at {host}:{port}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port, username, password, timeout=10)
    
    print("[*] Killing any existing server processes on port 8000...")
    # Kill in native Termux
    ssh.exec_command("fuser -k 8000/tcp || true")
    # Kill inside Ubuntu PRoot
    ssh.exec_command("proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -c 'fuser -k 8000/tcp || pkill -9 -f server.py || true'")
    time.sleep(1.5)
    
    print("[*] Restarting Maia-3 server inside tmux session 'maiaserver'...")
    ssh.exec_command("tmux kill-session -t maiaserver || true")
    time.sleep(1.5)
    
    # Launch new tmux session running the python server in proot ubuntu
    launch_cmd = "tmux new-session -d -s maiaserver 'proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -c \"cd /root && python3 server.py\"'"
    ssh.exec_command(launch_cmd)
    
    print("[*] Waiting for server to initialize (this takes a moment to load PyTorch)...")
    # Give it plenty of time (10 seconds) to boot up and initialize PyTorch/weights
    time.sleep(10)
    
    # Verify session is running
    stdin, stdout, stderr = ssh.exec_command("tmux list-sessions")
    sessions = stdout.read().decode()
    if "maiaserver" in sessions:
        print("[+] Success! Maia-3 server is running in tmux session 'maiaserver'.")
        print("[*] Engine URL: http://100.86.25.112:8000/move")
    else:
        print("[-] Error: Failed to start server in tmux. Check logs in Termux manually.")
        
    ssh.close()
except Exception as e:
    print(f"[!] Error: {e}")

print("\nPress Enter to close this window...")
input()
