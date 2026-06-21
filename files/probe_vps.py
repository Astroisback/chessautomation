import paramiko, sys

HOST = "100.86.25.112"
PORT = 8022
USER = "u0_a191"
PASS = "ryzen9"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

def run(cmd):
    _, stdout, stderr = client.exec_command(cmd, timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    return out, err

print("=== Connected ===")

out, _ = run("ls ~")
print("HOME:", out)

out, _ = run("find ~ -name '*.py' -not -path '*/.*' 2>/dev/null | head -30")
print("Python files:\n", out)

out, _ = run("find ~ /opt /usr/local -name 'maia*' -o -name 'lc0' -o -name '*.pb' 2>/dev/null | head -20")
print("Maia/lc0 files:\n", out)

out, _ = run("ps aux | grep -E 'python|flask|uvicorn|gunicorn|lc0' | grep -v grep")
print("Running processes:\n", out)

out, _ = run("which python3 python pip3 pip lc0 2>/dev/null")
print("Binaries:", out)

out, _ = run("python3 --version 2>&1; pip3 --version 2>&1")
print("Python version:", out)

client.close()
print("=== Done ===")
