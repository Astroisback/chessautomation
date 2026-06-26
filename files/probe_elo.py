import paramiko
import time

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=10)

transport = ssh.get_transport()
channel = transport.open_session()
channel.get_pty()
channel.exec_command("proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- maia3-5m --device cpu --no-use-amp")


def send(cmd):
    print(f"\nSEND: {cmd}")
    channel.send(cmd + "\n")


def read_until(target, timeout=90):
    buffer = ""
    start_time = time.time()
    while time.time() - start_time < timeout:
        if channel.recv_ready():
            char = channel.recv(1).decode("utf-8", "ignore")
            buffer += char
            if char == "\n":
                s = buffer.strip()
                if "multipv" in s or "bestmove" in s or target in s:
                    print(f"RECV: {s}")
                if target in buffer:
                    return buffer
                buffer = ""
        else:
            time.sleep(0.05)
    print(f"[!] Timeout waiting for '{target}'")
    return None


send("uci")
read_until("uciok")
send("isready")
read_until("readyok")
send("setoption name MultiPV value 5")

# A middlegame position (Italian, a few moves in)
pos = "position startpos moves e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6"

for elo in [1500, 1100, 900, 700, 500, 300]:
    print(f"\n========== Elo {elo} (via Elo + SelfElo) ==========")
    send(f"setoption name Elo value {elo}")
    send(f"setoption name SelfElo value {elo}")
    send("isready")
    read_until("readyok")
    send(pos)
    send("go nodes 1")
    read_until("bestmove")

send("quit")
time.sleep(1)
channel.close()
ssh.close()
