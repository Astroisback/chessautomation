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
    print(f"SEND: {cmd}")
    channel.send(cmd + "\n")


def read_until(target, timeout=30):
    buffer = ""
    start_time = time.time()
    while time.time() - start_time < timeout:
        if channel.recv_ready():
            char = channel.recv(1).decode("utf-8", "ignore")
            buffer += char
            if char == "\n":
                print(f"RECV: {buffer.strip()}")
                if target in buffer:
                    return buffer
                buffer = ""
        else:
            time.sleep(0.05)
    print(f"[!] Timeout waiting for '{target}'")
    return None


send("uci")
read_until("uciok", timeout=90)
send("isready")
read_until("readyok", timeout=90)
send("setoption name MultiPV value 5")
send("position startpos moves e2e4 e7e5 g1f3 b8c6")
send("go nodes 1")
read_until("bestmove")
send("quit")
time.sleep(1)
channel.close()
ssh.close()
