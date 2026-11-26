#!/usr/bin/env bash
# Keeps the bridge answering. Run every minute by mt5-bridge-watchdog.timer.
#
# Why: on 26 Nov 2026 the bridge stopped answering at about 06:20 UTC and stayed
# down for hours. The process did not exit, so `Restart=always` never fired;
# Cloudflare answered 502 to everything. The likely cause is the terminal
# restarting itself (MT5 LiveUpdate) and taking the Wine server the bridge
# shares with it along. A process that hangs needs something from outside.
#
# 1. /health does not answer twice in a row       -> restart mt5-bridge.
# 2. /health answers but the terminal is not connected to the broker for
#    15 minutes                                    -> restart mt5-terminal, at
#    most once an hour (it logs in again with the saved password; open
#    positions live at the broker and are not touched).
# Every action is one line in the journal: journalctl -u mt5-bridge-watchdog
set -u

STATE_DIR=/run/mt5-bridge-watchdog
mkdir -p "$STATE_DIR"
FAILS="$STATE_DIR/no-answer"
DOWN_SINCE="$STATE_DIR/terminal-down-since"
LAST_TERMINAL_RESTART=/var/lib/mt5-bridge-watchdog.terminal-restart
now=$(date +%s)

if ! body=$(curl -fsS -m 15 http://127.0.0.1:8765/health 2>/dev/null); then
  n=$(( $(cat "$FAILS" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$FAILS"
  echo "bridge did not answer /health ($n in a row)"
  if [ "$n" -ge 2 ]; then
    echo "restarting mt5-bridge"
    systemctl restart mt5-bridge
    rm -f "$FAILS"
  fi
  exit 0
fi
rm -f "$FAILS"

case "$body" in
  *'"ok":true'*)
    rm -f "$DOWN_SINCE"
    exit 0
    ;;
esac

# Answering, but the terminal is not connected to the broker.
[ -f "$DOWN_SINCE" ] || echo "$now" > "$DOWN_SINCE"
since=$(cat "$DOWN_SINCE")
last=$(cat "$LAST_TERMINAL_RESTART" 2>/dev/null || echo 0)
if [ $(( now - since )) -ge 900 ] && [ $(( now - last )) -ge 3600 ]; then
  echo "terminal not connected for $(( (now - since) / 60 )) min: restarting mt5-terminal"
  echo "$now" > "$LAST_TERMINAL_RESTART"
  systemctl restart mt5-terminal
  sleep 30
  systemctl restart mt5-bridge
  rm -f "$DOWN_SINCE"
fi
