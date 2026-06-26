"""
Upgrades the panel battery indicator to show:
  ⚡ 69% · 0.8W · 1h12m · 🌡42°C   (charging)
  🔋 69% · 🌡42°C                 (not charging)
  🔌 100% · 🌡42°C                (full)

Data sources (rooted Android sysfs):
  /sys/class/power_supply/battery/{capacity,status,voltage_now,current_now,temp}
  /sys/class/thermal/thermal_zone5/temp   (quiet_therm — board temp ~CPU)

ETA: extrapolated from a rolling history file (~last 30 minutes of SoC).
Watts: V * I, with auto-detection between mA and µA reporting (this device
       reports current_now in mA; voltage_now is always in µV).
"""
import paramiko

host="100.86.25.112"; port=8022; user="u0_a191"; pw="ryzen9"
H="/data/data/com.termux/files/home"
PREFIX="/data/data/com.termux/files/usr"
CACHE=f"{PREFIX}/tmp/battery.txt"
HIST=f"{PREFIX}/tmp/battery_history"
BASH=f"{PREFIX}/bin/bash"
DAEMON=f"{H}/battery_daemon.sh"
GENMON=f"{H}/battery_genmon.sh"

# Root daemon — reads sysfs every 15s, writes 6 lines + maintains a rolling
# history (last 30min) used to compute time-to-full.
#
# CPU temp: we pick the HOTTEST sensor across all SoC silicon zones
# (tsens_tz_sensor*, msm_therm). The original code used quiet_therm which is
# a SKIN/case sensor and stays around ambient — useless for "is the CPU
# hot right now?". The TSENS sensors are the actual junction temperatures.
daemon_sh = f"""#!/data/data/com.termux/files/usr/bin/bash
OUT={CACHE}
HIST={HIST}
B=/sys/class/power_supply/battery
HIST_WINDOW=1800   # seconds (30 min)

# Returns the hottest CPU/SoC sensor reading, normalised to deci-Celsius.
cpu_max_decic() {{
  local max=0 v dc t
  for z in /sys/class/thermal/thermal_zone*; do
    t=$(cat "$z/type" 2>/dev/null) || continue
    case "$t" in
      tsens_tz_sensor*|msm_therm|cpu*-thermal|soc-thermal|cpuss-thermal)
        v=$(cat "$z/temp" 2>/dev/null) || continue
        [ -z "$v" ] && continue
        # Normalise to deci-C: <200 raw C, 200..2000 deci-C, >2000 milli-C
        if [ "$v" -lt 200 ] 2>/dev/null; then dc=$((v * 10))
        elif [ "$v" -lt 2000 ] 2>/dev/null; then dc=$v
        else dc=$((v / 100))
        fi
        [ "$dc" -gt "$max" ] && max=$dc
        ;;
    esac
  done
  echo "$max"
}}

while true; do
  CAP=$(cat $B/capacity 2>/dev/null)
  ST=$(cat $B/status 2>/dev/null)
  VOLT=$(cat $B/voltage_now 2>/dev/null)
  CUR=$(cat $B/current_now 2>/dev/null)
  BTEMP=$(cat $B/temp 2>/dev/null)
  CTEMP=$(cpu_max_decic)              # always in deci-C
  NOW=$(date +%s)

  # Append to history, then trim to entries within HIST_WINDOW seconds.
  if [ -n "$CAP" ]; then
    echo "$NOW $CAP" >> "$HIST"
    CUTOFF=$((NOW - HIST_WINDOW))
    awk -v c="$CUTOFF" '$1+0 >= c' "$HIST" > "$HIST.tmp" 2>/dev/null \\
      && mv "$HIST.tmp" "$HIST"
    chmod 644 "$HIST" 2>/dev/null
  fi

  printf '%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n' \\
    "$CAP" "$ST" "$VOLT" "$CUR" "$BTEMP" "$CTEMP" > "$OUT" 2>/dev/null
  chmod 644 "$OUT" 2>/dev/null
  sleep 15
done
"""

# Panel script — non-root, reads cache + history, renders the line.
genmon_sh = r"""#!/data/data/com.termux/files/usr/bin/bash
F=__CACHE__
HIST=__HIST__

CAP=$(sed -n '1p' "$F" 2>/dev/null | tr -dc '0-9')
ST=$(sed -n  '2p' "$F" 2>/dev/null | tr -d '\r\n')
VOLT=$(sed -n '3p' "$F" 2>/dev/null | tr -dc '0-9-')
CUR=$(sed -n  '4p' "$F" 2>/dev/null | tr -dc '0-9-')
BTEMP=$(sed -n '5p' "$F" 2>/dev/null | tr -dc '0-9-')
CTEMP=$(sed -n '6p' "$F" 2>/dev/null | tr -dc '0-9-')

[ -z "$CAP" ] && CAP="?"
[ -z "$ST" ]  && ST="Unknown"

# ── Icon by status
case "$ST" in
  Charging) ICON="⚡" ;;
  Full)     ICON="🔌" ;;
  *)        ICON="🔋" ;;
esac

# ── Color (red when low and discharging)
COLOR="#e6e6e6"
if [ "$CAP" != "?" ] && [ "$CAP" -le 20 ] 2>/dev/null \
   && [ "$ST" != "Charging" ] && [ "$ST" != "Full" ]; then
  COLOR="#ff5555"
fi

# ── Watts: V * I, auto-detect mA vs µA for current_now.
# voltage_now is in µV. If |current_now| < 10000 -> mA. Else -> µA.
# Direction comes from `status` (sign of current_now isn't reliable across
# kernels — we've seen it positive AND negative during "Charging").
PW=""
if [ -n "$VOLT" ] && [ -n "$CUR" ] && [ "$VOLT" -gt 0 ] 2>/dev/null; then
  ACUR=${CUR#-}
  if [ -n "$ACUR" ] && [ "$ACUR" -gt 0 ] 2>/dev/null; then
    if [ "$ACUR" -lt 10000 ]; then
      # mA path: W = (VOLT/1e6) * (ACUR/1e3) -> tenths = VOLT*ACUR / 1e8
      TENTHS=$((VOLT * ACUR / 100000000))
    else
      # µA path: W = (VOLT/1e6) * (ACUR/1e6) -> tenths = VOLT*ACUR / 1e11
      TENTHS=$((VOLT * ACUR / 100000000000))
    fi
    INT=$((TENTHS / 10))
    FRAC=$((TENTHS % 10))
    [ "$INT" -gt 0 ] || [ "$FRAC" -gt 0 ] && PW="${INT}.${FRAC}W"
  fi
fi

# Direction is shown by COLOUR only (no arrow — was being confused with "1").
# Charging  -> green watts
# Full      -> no watts shown (it's 0 anyway and "100%" already implies it)
# anything else (Discharging / Not charging / Unknown) -> amber watts
case "$ST" in
  Charging) PW_COL="#8fcb6e"; SHOW_PW=1 ;;
  Full)     PW_COL="";        SHOW_PW=0 ;;
  *)        PW_COL="#e9b96e"; SHOW_PW=1 ;;
esac

PW_FMT=""
if [ "$SHOW_PW" = "1" ] && [ -n "$PW" ]; then
  PW_FMT="<span foreground='$PW_COL'>${PW}</span>"
fi

# ── ETA to full from rolling history (only when charging).
ETA=""
if [ "$ST" = "Charging" ] && [ -r "$HIST" ] && [ "$CAP" != "?" ]; then
  OLD_LINE=$(head -n 1 "$HIST" 2>/dev/null)
  OLD_TIME=$(echo "$OLD_LINE" | awk '{print $1}')
  OLD_CAP=$(echo  "$OLD_LINE" | awk '{print $2}')
  NOW=$(date +%s)
  if [ -n "$OLD_TIME" ] && [ -n "$OLD_CAP" ]; then
    DT=$((NOW - OLD_TIME))
    DC=$((CAP - OLD_CAP))
    if [ "$DT" -gt 60 ] && [ "$DC" -gt 0 ]; then
      SPP=$((DT / DC))                   # seconds per percent
      REMAIN=$(((100 - CAP) * SPP))
      H=$((REMAIN / 3600))
      M=$(((REMAIN % 3600) / 60))
      if [ "$H" -gt 0 ]; then
        ETA="${H}h${M}m"
      else
        ETA="${M}m"
      fi
    fi
  fi
fi

# ── Temperature.
# Both BTEMP and CTEMP are written by the daemon in deci-Celsius (CTEMP is
# the MAX across SoC silicon sensors — tsens_tz_sensor*, msm_therm, etc. —
# so it reflects real CPU junction temperature under load, not the case).
TEMP_BATT=""; TEMP_CPU=""
if [ -n "$BTEMP" ] && [ "$BTEMP" != "0" ]; then
  BT_C=$((BTEMP / 10))
  TEMP_BATT="🌡${BT_C}°C"
fi
if [ -n "$CTEMP" ] && [ "$CTEMP" != "0" ]; then
  CT_C=$((CTEMP / 10))
  TEMP_CPU="🖥${CT_C}°C"
fi

# ── Build display
PARTS="${CAP}%"
[ -n "$PW_FMT" ]    && PARTS="$PARTS · $PW_FMT"
[ -n "$ETA" ]       && PARTS="$PARTS · $ETA"
[ -n "$TEMP_BATT" ] && PARTS="$PARTS · $TEMP_BATT"
[ -n "$TEMP_CPU" ]  && PARTS="$PARTS · $TEMP_CPU"

echo "<txt> $ICON <span foreground='$COLOR'>${CAP}%</span>$( [ -n "$PW_FMT" ] && echo " · $PW_FMT" )$( [ -n "$ETA" ] && echo " · <span foreground='$COLOR'>$ETA</span>" )$( [ -n "$TEMP_BATT" ] && echo " · <span foreground='$COLOR'>$TEMP_BATT</span>" )$( [ -n "$TEMP_CPU" ] && echo " · <span foreground='$COLOR'>$TEMP_CPU</span>" ) </txt>"

# Tooltip on hover — shows everything including CPU temp.
TOOL_BATT="?°C"; TOOL_CPU="?°C"
[ -n "$BT_C" ] && TOOL_BATT="${BT_C}°C"
[ -n "$CT_C" ] && TOOL_CPU="${CT_C}°C"
echo "<tool>Battery: ${CAP}% (${ST})
Power:     ${PW:-—}
ETA full:  ${ETA:-—}
Batt temp: ${TOOL_BATT}
CPU temp:  ${TOOL_CPU}</tool>"
""".replace("__CACHE__", CACHE).replace("__HIST__", HIST)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, user, pw, timeout=20)

def run(cmd, t=30):
    i, o, e = ssh.exec_command(cmd, timeout=t)
    return o.read().decode(errors="replace") + e.read().decode(errors="replace")

sftp = ssh.open_sftp()
def put(path, txt):
    with sftp.open(path, "wb") as f: f.write(txt.encode("utf-8"))

# 1) Write upgraded scripts
put(DAEMON, daemon_sh)
put(GENMON, genmon_sh)
run(f"chmod +x {DAEMON} {GENMON}")
print("[+] Wrote upgraded daemon + genmon.")

# 2) Restart the root battery daemon. We delegate to the wrapper that the
#    XFCE autostart also uses (~/start_battery_daemon.sh): same launch path,
#    no duplicated logic, and it survives SSH channel close because of
#    `nohup setsid su -c "..." &` inside it.
print("[*] Restarting battery daemon (via wrapper)...")
print(run(
    "export PATH=/data/data/com.termux/files/usr/bin:$PATH; "
    # kill the old daemon, anchored so we don't match the wrapper itself
    "su -c 'pkill -f /battery_daemon\\.sh' 2>/dev/null; sleep 2; "
    f"bash {H}/start_battery_daemon.sh; sleep 5; "
    "ps -ef 2>/dev/null | grep -E '[b]attery_daemon' | head"
))

# 3) Show cache + a live render
import time; time.sleep(2)
print("[*] Cache contents:")
print(run(f"cat {CACHE} 2>&1"))
print("[*] Live panel render:")
print(run(f"bash {GENMON} 2>&1"))

# 4) Force genmon plugin to re-execute by killing just its wrapper.
print("[*] Respawning genmon panel wrapper...")
print(run("pkill -f 'wrapper.*libgenmon'; sleep 4; pgrep -af 'wrapper.*libgenmon' | head"))

sftp.close()
ssh.close()
print("[+] Done. Panel will refresh within ~15s. ETA appears once 2+ "
      "history points exist (1-2 minutes of charging).")
