#!/usr/bin/env bash
# Update the bridge on a box that is already set up. Run as root after copying
# services/mt5-bridge to /opt/mt5-bridge:
#
#   rsync -a -e "ssh -i ~/.ssh/mt5_bridge" services/mt5-bridge/ root@HOST:/opt/mt5-bridge/
#   ssh -i ~/.ssh/mt5_bridge root@HOST 'bash /opt/mt5-bridge/deploy/update.sh'
#
# Installs the unit files and the watchdog, then restarts the bridge only. The
# terminal keeps running, so its broker login and the Algo Trading button stay
# as they are (install.sh, by contrast, stops the terminal to update Wine).
# First it prints what happened recently, so a fault is visible before the
# restart clears it.
set -euo pipefail

APP=/opt/mt5-bridge
ENV_FILE=/etc/mt5-bridge.env
say() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
[ -f "$APP/mt5_bridge/app.py" ] || { echo "copy services/mt5-bridge to $APP first"; exit 1; }

say "what happened (last 12 hours)"
uptime
free -m | sed -n 1,2p
for s in mt5-xvfb mt5-terminal mt5-bridge cloudflared; do echo "$s: $(systemctl is-active "$s" 2>/dev/null || true)"; done
echo "bridge listening on 8765: $(ss -ltn 2>/dev/null | grep -c ':8765 ' || true)"
echo "-- out of memory:"
journalctl -k --since "-12 hours" --no-pager 2>/dev/null | grep -iE "out of memory|oom-kill|killed process" | tail -3 || true
echo "-- bridge (without request lines):"
journalctl -u mt5-bridge --since "-12 hours" --no-pager 2>/dev/null | grep -vE '"(GET|POST) /' | tail -12 | cut -c1-200 || true
echo "-- terminal:"
journalctl -u mt5-terminal --since "-12 hours" --no-pager 2>/dev/null | tail -6 | cut -c1-200 || true

say "units, watchdog and host metrics"
install -m 0755 "$APP/deploy/mt5-host-metrics" /usr/local/bin/mt5-host-metrics
install -d -o mt5 -g mt5 -m 0755 /opt/mt5-bridge/var
install -m 0644 "$APP/deploy/mt5-bridge.service" "$APP/deploy/mt5-bridge-watchdog.service" \
  "$APP/deploy/mt5-bridge-watchdog.timer" \
  "$APP/deploy/mt5-bridge-metrics.service" "$APP/deploy/mt5-bridge-metrics.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mt5-bridge-watchdog.timer >/dev/null
systemctl enable --now mt5-bridge-metrics.timer >/dev/null
echo "watchdog: $(systemctl is-active mt5-bridge-watchdog.timer)"
echo "metrics timer: $(systemctl is-active mt5-bridge-metrics.timer)"
# Write one snapshot now so /host/metrics has a file before the first tick.
sudo -u mt5 /usr/local/bin/mt5-host-metrics --quiet --write /opt/mt5-bridge/var/host-metrics.json || true

say "bridge restart (the terminal keeps running)"
systemctl reset-failed mt5-bridge 2>/dev/null || true
systemctl restart mt5-bridge
health=""
for _ in $(seq 1 20); do
  if health=$(curl -fsS -m 10 http://127.0.0.1:8765/health 2>/dev/null); then break; fi
  health=""
  sleep 3
done
echo "health: ${health:-no answer after 60 s}"
TOKEN=$(grep ^MT5_BRIDGE_TOKEN= "$ENV_FILE" | cut -d= -f2)
curl -s -m 15 -H "auth-token: $TOKEN" http://127.0.0.1:8765/status | sed -E 's/"login": *[0-9]+/"login":"[login]"/'
echo
# Host metrics only (percentages + timestamp). The token itself is not printed.
curl -s -m 15 -H "auth-token: $TOKEN" http://127.0.0.1:8765/host/metrics || echo "host metrics: no answer"
echo
