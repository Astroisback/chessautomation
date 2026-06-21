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

print("[*] Installing stockfish natively safely...")
print(exec_cmd("DEBIAN_FRONTEND=noninteractive yes '' | pkg install -o Dpkg::Options::=--force-confold python stockfish tmux || true"))

pure_server = """
import http.server
import socketserver
import json
import subprocess

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
            
            moves_str = " ".join(req.get('moves', []))
            position_cmd = f"position startpos moves {moves_str}" if moves_str else "position startpos"
            
            process = subprocess.Popen(
                ['stockfish'], 
                stdin=subprocess.PIPE, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                text=True
            )
            
            commands = f"uci\\n{position_cmd}\\ngo movetime 1000\\n"
            stdout, stderr = process.communicate(input=commands)
            
            bestmove = None
            for line in stdout.split('\\n'):
                if line.startswith('bestmove'):
                    bestmove = line.split(' ')[1]
                    break
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"move": bestmove}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

PORT = 8000
with socketserver.TCPServer(("", PORT), MoveHandler) as httpd:
    print(f"Serving at port {PORT}")
    httpd.serve_forever()
"""

print("[*] Writing server.py for Termux...")
write_cmd = f"cat << 'EOF' > /data/data/com.termux/files/home/termux_server.py\n{pure_server}\nEOF\n"
exec_cmd(write_cmd)

print("[*] Launching via native tmux...")
exec_cmd("tmux kill-session -t chessserver || true")
exec_cmd("tmux new-session -d -s chessserver 'python termux_server.py > server.log 2>&1'")

print("[*] Wait 3 seconds...")
time.sleep(3)

print("[*] Server log:")
print(exec_cmd("cat /data/data/com.termux/files/home/server.log"))

ssh.close()
