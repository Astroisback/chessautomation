import paramiko
import os

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=10)

sftp = ssh.open_sftp()
base_remote_path = "/data/data/com.termux/files/home/Desktop/ChessAutomata"

try:
    sftp.mkdir("/data/data/com.termux/files/home/Desktop")
except Exception:
    pass

try:
    sftp.mkdir(base_remote_path)
except Exception:
    pass

files_to_upload = [
    "manifest.json",
    "background.js",
    "content.js",
    "popup.html",
    "popup.js",
    "popup.css"
]

print("[*] Uploading extension files to VPS Desktop...")

for f in files_to_upload:
    local_path = os.path.join(r"y:\Chess Automata", f)
    remote_path = f"{base_remote_path}/{f}"
    if os.path.exists(local_path):
        sftp.put(local_path, remote_path)
        print(f"Uploaded {f}")

# Try to upload icons if they exist
try:
    sftp.mkdir(f"{base_remote_path}/icons")
except Exception:
    pass

for icon in ["icon16.png", "icon48.png", "icon128.png"]:
    local_icon = os.path.join(r"y:\Chess Automata\icons", icon)
    remote_icon = f"{base_remote_path}/icons/{icon}"
    if os.path.exists(local_icon):
        sftp.put(local_icon, remote_icon)
        print(f"Uploaded {icon}")

sftp.close()
ssh.close()
print("[+] Done!")
