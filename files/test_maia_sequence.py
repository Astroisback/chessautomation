import paramiko
import time

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

try:
    print(f"[*] Connecting to Android VPS at {host}:{port}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port, username, password, timeout=10)
    
    # We will launch maia3-5m inside proot ubuntu manually and send commands interactively
    # to see how it responds to sequential moves.
    transport = ssh.get_transport()
    channel = transport.open_session()
    channel.get_pty()
    channel.exec_command("proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- maia3-5m --device cpu --no-use-amp")
    
    def send(cmd):
        print(f"SEND: {cmd}")
        channel.send(cmd + "\n")
        
    def read_until(target, timeout=10):
        buffer = ""
        start_time = time.time()
        while time.time() - start_time < timeout:
            if channel.recv_ready():
                char = channel.recv(1).decode('utf-8', 'ignore')
                buffer += char
                if char == "\n":
                    line = buffer.strip()
                    print(f"RECV: {line}")
                    if target in line:
                        return buffer
                    buffer = ""
            else:
                time.sleep(0.1)
        print(f"[!] Timeout waiting for '{target}'. Buffer so far: {buffer}")
        return None

    # Step 1: UCI init
    read_until("Maia") # Wait for startup banner if any, or just wait a bit
    send("uci")
    read_until("uciok")
    
    # Step 2: IsReady
    send("isready")
    read_until("readyok")
    
    # Step 3: Move 1
    send("position startpos moves e2e4")
    send("go nodes 1")
    read_until("bestmove")
    
    # Step 4: Move 2
    send("position startpos moves e2e4 e7e5 g1f3")
    send("go nodes 1")
    read_until("bestmove")
    
    # Step 5: Quit
    send("quit")
    time.sleep(1)
    channel.close()
    ssh.close()
except Exception as e:
    print(f"[!] Error: {e}")
