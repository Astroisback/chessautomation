import paramiko

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

try:
    print(f"[*] Connecting to Android VPS at {host}:{port}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port, username, password, timeout=10)
    
    # We want to create the shortcut inside the Ubuntu environment's Desktop folder.
    # The home folder of root inside Ubuntu is /root, which corresponds to the bind-mounted Termux home folder /data/data/com.termux/files/home.
    # So inside Termux, we can create the directory ~/Desktop if it doesn't exist, and write the file.
    
    print("[*] Creating Desktop folder if it doesn't exist...")
    # This creates the Desktop directory in Termux home, which is mounted as /root inside Ubuntu.
    ssh.exec_command("mkdir -p /data/data/com.termux/files/home/Desktop")
    
    desktop_entry = """[Desktop Entry]
Version=1.0
Type=Application
Name=Start Maia-3 Server
Comment=Launches Maia-3 Backend in a tmux session
Exec=proot-distro login ubuntu --bind /data/data/com.termux/files/home:/root -- bash -c "tmux kill-session -t maiaserver || true; tmux new-session -d -s maiaserver 'python3 /root/server.py'"
Icon=utilities-terminal
Path=/data/data/com.termux/files/home
Terminal=true
StartupNotify=false
"""
    
    # We will write the .desktop file to the Termux home Desktop directory
    print("[*] Writing Start_Maia3.desktop file...")
    # Escape single quotes and write
    write_cmd = f"cat << 'EOF' > /data/data/com.termux/files/home/Desktop/Start_Maia3.desktop\n{desktop_entry}\nEOF\n"
    ssh.exec_command(write_cmd)
    
    # Make it executable so XFCE trusts it
    print("[*] Making the shortcut executable...")
    ssh.exec_command("chmod +x /data/data/com.termux/files/home/Desktop/Start_Maia3.desktop")
    
    print("[+] Success! Created the 'Start Maia-3 Server' shortcut on your VPS Desktop.")
    ssh.close()
except Exception as e:
    print(f"[!] Error: {e}")
