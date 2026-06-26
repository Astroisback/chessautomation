import paramiko
import base64

host = "100.86.25.112"
port = 8022
username = "u0_a191"
password = "ryzen9"

script = r'''
export PATH=$PREFIX/bin:$PATH
echo "=== display servers (Xvnc / xrdp / X) ==="
ps -ef 2>/dev/null | grep -iE "[X]vnc|[x]rdp|[n]ovnc|[w]ebsockify|[v]ncserver|[X]org|[x]fce4-session" | head -30
echo
echo "=== listening ports (5901 vnc / 6080 novnc / 3389 rdp) ==="
(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep -E "5901|6080|3389|5900" || echo "none of vnc/novnc/rdp ports listening"
echo
echo "=== X socket ==="
ls -la $PREFIX/tmp/.X11-unix 2>/dev/null; ls -la /tmp/.X11-unix 2>/dev/null
echo
echo "=== tmux sessions ==="
tmux list-sessions 2>&1
'''

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=15)
b64 = base64.b64encode(script.encode()).decode()
stdin, stdout, stderr = ssh.exec_command("echo {} | base64 -d | bash".format(b64), timeout=60)
print(stdout.read().decode(errors="ignore"))
print("----STDERR----")COuk
print(stderr.read().decode(errors="ignore"))
ssh.close()
