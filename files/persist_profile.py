"""
Makes the Firefox profile persistent for the Chess Automata launcher.

Problem: web-ext's `--keep-profile-changes` calls firefox-profile's
locateUserDirectory(), which throws "unsupported platform android" on Termux.

Fix:
  1) Patch firefox-profile/lib/profile_finder.js to add an 'android' case.
  2) Ensure ~/chess_bot_start.sh launches Firefox with a persistent profile.
  3) Restart the chessff session so it takes effect now.
"""
import paramiko

host = "100.86.25.112"; port = 8022; username = "u0_a191"; password = "ryzen9"
H = "/data/data/com.termux/files/home"
PF = "/data/data/com.termux/files/usr/lib/node_modules/web-ext/node_modules/firefox-profile/lib/profile_finder.js"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password, timeout=20)
sftp = ssh.open_sftp()

def run(cmd, timeout=40):
    i, o, e = ssh.exec_command(cmd, timeout=timeout)
    return o.read().decode(errors="replace") + e.read().decode(errors="replace")

# ── 1) Patch the firefox-profile library ───────────────────────────────────
with sftp.open(PF, "r") as f:
    src = f.read().decode(errors="replace")

needle = "return path.join(process.env.APPDATA, '/Mozilla/Firefox');"
android_case = (
    needle
    + "\n    case 'android':"
    + "\n      return path.join(process.env.HOME, '.mozilla/firefox');"
)

if "case 'android':" in src:
    print("[=] firefox-profile already patched for android.")
elif needle in src:
    src = src.replace(needle, android_case, 1)
    with sftp.open(PF, "w") as f:
        f.write(src)
    print("[+] Patched firefox-profile to support android.")
else:
    print("[!] Could not find the win32 case to patch — aborting patch step.")

# ── 2) Make sure the persistent profile dir exists ─────────────────────────
run(f"mkdir -p {H}/chess_ff_profile")

sftp.close()

# ── 3) Restart Firefox with the persistent profile ────────────────────────
print("[*] Restarting Firefox (chessff) with persistent profile...")
run(
    "export PREFIX=/data/data/com.termux/files/usr; export PATH=$PREFIX/bin:$PATH; "
    "tmux kill-session -t chessff 2>/dev/null; sleep 1; "
    "tmux new-session -d -s chessff "
    f"'DISPLAY=:1 web-ext run --source-dir {H}/chess_ext --firefox \"$(command -v firefox)\" "
    f"--no-reload --firefox-profile {H}/chess_ff_profile --profile-create-if-missing "
    f"--keep-profile-changes --start-url \"https://www.chess.com/play/online\" > {H}/chess_ff.log 2>&1'"
)

ssh.close()
print("[+] Done. Give Firefox ~10s, then check chess_ff.log if needed.")
