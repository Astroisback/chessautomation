import paramiko
import time

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

print(f"[*] Connecting to Android VPS at {host}:{port}...")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=10)

def exec_cmd(cmd, desc):
    print(f"[*] {desc}...")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    if exit_status != 0:
        print(f"[!] Error during: {desc}")
        print("STDERR:", stderr.read().decode())
    else:
        print(f"[+] Success.")
    return stdout.read().decode()

# 1. Ensure proot-distro and tmux are installed
exec_cmd("pkg install -y proot-distro tmux git", "Installing proot-distro, tmux & git in Termux")

# 2. Install Ubuntu
exec_cmd("proot-distro install ubuntu", "Installing Ubuntu PRoot (this may take a moment)")

# 3. Setup commands inside Ubuntu — install Maia-3 instead of lc0
ubuntu_setup_cmds = """
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-pip python3-venv git wget tmux
pip3 install --break-system-packages torch --index-url https://download.pytorch.org/whl/cpu
if [ ! -d "/root/maia3" ]; then
    cd /root && git clone https://github.com/CSSLab/maia3.git
fi
cd /root/maia3 && pip3 install . --break-system-packages
maia3-cache --model maia3-5m
"""

# Write the setup script for Ubuntu
setup_script = "cat << 'EOF' > ubuntu_setup.sh\n" + ubuntu_setup_cmds + "\nEOF\n"
exec_cmd(setup_script, "Writing Ubuntu setup script")

# Execute the setup script inside Ubuntu
exec_cmd("proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash /root/ubuntu_setup.sh", "Running setup inside Ubuntu (installing Maia-3 & PyTorch CPU)")

# 4. Create the Maia-3 Server Code inside Ubuntu
server_code = """
import http.server
import socketserver
import json
import subprocess
import threading
import queue
import time

class UCIEngine:
    def __init__(self):
        self.process = None
        self.stdout_queue = queue.Queue()
        self.start_process()

    def start_process(self):
        if self.process and self.process.poll() is None:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except:
                pass
        
        print("[*] Starting maia3-5m process...")
        self.process = subprocess.Popen(
            ['maia3-5m', '--device', 'cpu', '--no-use-amp'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        # Drain queue
        while not self.stdout_queue.empty():
            try:
                self.stdout_queue.get_nowait()
            except queue.Empty:
                break
                
        self.stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self.stdout_thread.start()
        
        self.send_command("uci")
        self.send_command("isready")
        self.wait_for("readyok", timeout=60)
        print("[+] Engine ready!")

    def _read_stdout(self):
        try:
            for line in iter(self.process.stdout.readline, ''):
                self.stdout_queue.put(line)
        except Exception as e:
            print(f"Stdout read error: {e}")
        finally:
            try:
                self.process.stdout.close()
            except:
                pass

    def send_command(self, cmd):
        self.process.stdin.write(cmd + "\\n")
        self.process.stdin.flush()

    def wait_for(self, target, timeout=60):
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                line = self.stdout_queue.get(timeout=0.5)
                if target in line:
                    return line
            except queue.Empty:
                if self.process.poll() is not None:
                    raise RuntimeError("Engine process exited unexpectedly")
                continue
        raise TimeoutError(f"Timed out waiting for: {target}")

    def get_move(self, moves, elo):
        if self.process.poll() is not None:
            self.start_process()
            
        try:
            self.send_command(f"setoption name Elo value {elo}")
            self.send_command("isready")
            self.wait_for("readyok", timeout=15)
            
            moves_str = " ".join(moves)
            position_cmd = f"position startpos moves {moves_str}" if moves_str else "position startpos"
            self.send_command(position_cmd)
            
            self.send_command("go nodes 1")
            bestmove_line = self.wait_for("bestmove", timeout=30)
            
            parts = bestmove_line.split()
            if len(parts) >= 2:
                return parts[1]
        except Exception as e:
            print(f"[!] Engine error: {e}. Restarting engine...")
            self.start_process()
            raise e
        return None

ENGINE = UCIEngine()
ENGINE_LOCK = threading.Lock()

class MoveHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/move':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            req = json.loads(post_data.decode('utf-8'))
            
            moves = req.get('moves', [])
            elo = req.get('elo', 1100)
            
            bestmove = None
            try:
                with ENGINE_LOCK:
                    bestmove = ENGINE.get_move(moves, elo)
            except Exception as e:
                print(f"[!] Error handling move request: {e}")
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"move": bestmove}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

PORT = 8000
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), MoveHandler) as httpd:
    print(f"Maia-3 server listening on port {PORT}")
    httpd.serve_forever()
"""

write_server_cmd = f"cat << 'EOF' > server.py\n{server_code}\nEOF\n"
exec_cmd(write_server_cmd, "Writing Maia-3 server.py to Termux root")

# 5. Launch the server inside Ubuntu via tmux
exec_cmd("tmux kill-session -t maiaserver || true", "Cleaning old sessions")

launch_cmd = "tmux new-session -d -s maiaserver 'proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -c \"cd /root && python3 server.py\"'"
exec_cmd(launch_cmd, "Launching Maia-3 FastAPI server in background tmux session")

print("[*] Deployment Complete! The Maia-3 server should now be running on your VPS.")
print("[*] In your Chrome extension, set your VPS Engine URL to: http://100.86.25.112:8000/move")

ssh.close()
