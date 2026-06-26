import paramiko

new_code = """import http.server
import socketserver
import json
import subprocess
import threading
import queue
import time
import random

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

    def get_move(self, moves, elo, must_win=False):
        if self.process.poll() is not None:
            self.start_process()
            
        try:
            # Maia3 is a skill-conditioned HUMAN model. Tell it how strong to
            # play via Elo/SelfElo so its candidate ranking reflects what a
            # human of that rating would actually do.
            # NOTE: maia3-5m natively supports ELO down to ~0 (probed: 50, 100,
            # 200, 300 all produce meaningfully weaker, distinct moves). The
            # old clamp of 500 silently bumped intentional-blunder requests
            # (elo 400-599) up to 500, eating the lower half of the blunder
            # range. Floor lowered to 100 so genuine sub-500 blunders work.
            engine_elo = max(100, min(2000, int(elo)))
            self.send_command(f"setoption name Elo value {engine_elo}")
            self.send_command(f"setoption name SelfElo value {engine_elo}")
            self.send_command("setoption name MultiPV value 5")
            self.send_command("isready")
            self.wait_for("readyok", timeout=15)
            
            moves_str = " ".join(moves)
            position_cmd = f"position startpos moves {moves_str}" if moves_str else "position startpos"
            self.send_command(position_cmd)
            
            self.send_command("go nodes 1")
            
            # Read lines until bestmove
            multipv_moves = {}
            bestmove = None
            
            start_time = time.time()
            while time.time() - start_time < 30:
                try:
                    line = self.stdout_queue.get(timeout=0.5)
                    if "multipv" in line and " pv " in line:
                        parts = line.split()
                        try:
                            pv_idx = parts.index("multipv") + 1
                            move_idx = parts.index("pv") + 1
                            m_idx = int(parts[pv_idx])
                            move_str = parts[move_idx]
                            multipv_moves[m_idx] = move_str
                        except (ValueError, IndexError):
                            pass
                    if "bestmove" in line:
                        parts = line.split()
                        if len(parts) >= 2:
                            bestmove = parts[1]
                        break
                except queue.Empty:
                    if self.process.poll() is not None:
                        raise RuntimeError("Engine process exited")
                    continue
            
            # --- Human-like move selection ---------------------------------
            # MUST-WIN MODE: return the engine's top move with no sampling.
            # This is the strongest play Maia can produce — no human-style
            # alternative choices, no blunder bias.
            if must_win and multipv_moves:
                top = multipv_moves.get(1, bestmove)
                print(f"[*] MUST-WIN pick (elo={elo}): {top}")
                return top

            # Maia orders its candidate moves by how likely a HUMAN is to play
            # them (multipv rank 1 = most human-likely). The old logic picked
            # UNIFORMLY at random from ranks 3-5, so the least human-like move
            # (rank 5) was chosen just as often as a plausible one (rank 3).
            # That is what produced the robotic, non-human moves: knight
            # shuffles and pieces going back and forth.
            #
            # Instead, sample from the candidates weighted by human likelihood.
            # Strong play just uses the top move; weak/blunder play flattens the
            # distribution so natural mistakes happen more often, while
            # genuinely non-human moves stay rare.
            if not multipv_moves:
                return bestmove

            ranks = sorted(multipv_moves.keys())
            candidates = [multipv_moves[r] for r in ranks]

            # decay: how sharply we prefer the top (most human) move.
            #   high elo -> steep decay -> mostly the best move
            #   low elo  -> flatter     -> more natural variety / human mistakes
            e = max(500, min(1800, int(elo)))
            decay = 0.72 - (e - 500) * (0.72 - 0.35) / (1800 - 500)
            decay = max(0.35, min(0.72, decay))
            weights = [decay ** i for i in range(len(candidates))]

            # Intentional-blunder zone: the frontend sends elo 400-599 when it
            # wants a deliberate mistake. Bias hard away from the single best
            # move toward the NEXT most human alternatives (rank 2-3), while
            # keeping the weird filler move (rank 5) rare. This yields a
            # believable human blunder instead of a robotic shuffle.
            if elo < 600 and len(candidates) > 1:
                weights[0] *= 0.12

            chosen = random.choices(candidates, weights=weights, k=1)[0]
            if chosen != bestmove:
                print(f"[*] Human pick (elo={elo}): chose {chosen} over best {bestmove}")
            return chosen
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
            must_win = bool(req.get('mustWin', False))
            
            bestmove = None
            try:
                with ENGINE_LOCK:
                    bestmove = ENGINE.get_move(moves, elo, must_win)
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

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("100.86.25.112", 8022, "u0_a191", "ryzen9", timeout=10)

print("Connected. Updating server.py...")
sftp = ssh.open_sftp()
with sftp.file('new_server.py', 'w') as f:
    f.write(new_code)
sftp.close()

# Kill python server inside proot, copy file, then run
# We just use pkill since it's inside termux
ssh.exec_command("proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -c 'cp /root/new_server.py /root/server.py && pkill -f server.py'")

print("Server.py updated and old process killed.")
ssh.close()
