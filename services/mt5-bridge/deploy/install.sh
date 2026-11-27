#!/usr/bin/env bash
# One-shot setup of the MT5 bridge box (Ubuntu 24.04, run as root).
#
#   rsync -a services/mt5-bridge/ root@HOST:/opt/mt5-bridge/
#   ssh root@HOST bash /opt/mt5-bridge/deploy/install.sh
#
# Safe to run again: every step checks whether it is already done.
# It never asks for or stores the broker password; Luka logs in to the
# terminal once over VNC afterwards (README step 5).
set -euo pipefail

APP=/opt/mt5-bridge
PREFIX=/home/mt5/.mt5
ENV_FILE=/etc/mt5-bridge.env
PY_VERSION=3.11.9
PY_EXE='C:\Program Files\Python311\python.exe'
TERMINAL_EXE='C:\Program Files\MetaTrader 5\terminal64.exe'
DL=/var/cache/mt5-bridge

say() { printf '\n== %s\n' "$*"; }
as_mt5() { sudo -u mt5 env HOME=/home/mt5 WINEPREFIX="$PREFIX" WINEDEBUG=-all DISPLAY=:99 "$@"; }

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
. /etc/os-release
[ "${VERSION_ID:-}" = "24.04" ] || echo "warning: tested on Ubuntu 24.04, this is ${PRETTY_NAME:-unknown}"
[ -f "$APP/mt5_bridge/app.py" ] || { echo "copy services/mt5-bridge to $APP first"; exit 1; }

say "swap (2 GB): Wine plus the terminal spike on start"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "packages"
dpkg --add-architecture i386
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq xvfb x11vnc winbind cabextract curl ca-certificates gpg ufw unattended-upgrades >/dev/null

say "Wine from WineHQ"
# Ubuntu's own Wine (9.0) is too old for today's MT5: build 6331 stops at start
# with "A debugger has been found running in your system" (25 Nov 2026, also
# reproduced off the box). WineHQ's stable Wine (11.0) runs it.
if [ ! -x /opt/wine-stable/bin/wine ]; then
  mkdir -pm755 /etc/apt/keyrings
  curl -fsSL https://dl.winehq.org/wine-builds/winehq.key | gpg --dearmor --yes -o /etc/apt/keyrings/winehq-archive.key
  curl -fsSL -o "/etc/apt/sources.list.d/winehq-${VERSION_CODENAME:-noble}.sources" \
    "https://dl.winehq.org/wine-builds/ubuntu/dists/${VERSION_CODENAME:-noble}/winehq-${VERSION_CODENAME:-noble}.sources"
  apt-get update -qq
  # A box set up before this step has Ubuntu's Wine: stop what runs on it and
  # take it out, so the two never mix. Nothing else here uses it.
  systemctl stop mt5-bridge mt5-terminal 2>/dev/null || true
  apt-get remove -y -qq wine wine64 wine32:i386 libwine libwine:i386 >/dev/null 2>&1 || true
  apt-get install -y -qq --install-recommends winehq-stable >/dev/null
fi
wine --version

say "firewall: only SSH in (the bridge listens on 127.0.0.1, the tunnel dials out)"
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null

say "user mt5"
id mt5 >/dev/null 2>&1 || adduser --disabled-password --gecos '' mt5 >/dev/null

say "secrets in $ENV_FILE"
if [ ! -f "$ENV_FILE" ]; then
  umask 027
  cat > "$ENV_FILE" <<EOF
MT5_BRIDGE_TOKEN=$(openssl rand -hex 32)
MT5_BRIDGE_ACCOUNT_ID=upcomers-12347717
MT5_BRIDGE_TRADING=off
BROKER_UTC_OFFSET_HOURS=2
MT5_TERMINAL_PATH='$TERMINAL_EXE'
# Optional read-only token for GET /host/metrics (AXE Core). Leave empty
# until set by hand; it cannot be used to trade or read the account.
# MT5_BRIDGE_METRICS_TOKEN=
EOF
  umask 022
fi
# systemd drops the backslashes from an unquoted value in an EnvironmentFile, so
# the path must stay in single quotes. Runs before 25 Nov 2026 wrote it bare
# ("Process create failed 'C:Program FilesMetaTrader 5terminal64.exe'"): fix that.
if ! grep -qxF "MT5_TERMINAL_PATH='$TERMINAL_EXE'" "$ENV_FILE"; then
  { grep -v '^MT5_TERMINAL_PATH=' "$ENV_FILE" || true; printf '%s\n' "MT5_TERMINAL_PATH='$TERMINAL_EXE'"; } > "$ENV_FILE.new"
  mv "$ENV_FILE.new" "$ENV_FILE"
fi
chown root:mt5 "$ENV_FILE" && chmod 0640 "$ENV_FILE"

say "virtual screen"
install -m 0644 "$APP/deploy/mt5-xvfb.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mt5-xvfb >/dev/null
sleep 2

say "Wine prefix"
# The terminal and the bridge must not run while the prefix is made or updated.
systemctl stop mt5-bridge mt5-terminal 2>/dev/null || true
# A new Wine updates the prefix on its first start and then asks, on a screen
# nobody watches, to install Mono and Gecko. MT5 needs neither, so the update
# runs here, once, with both switched off.
if [ -d "$PREFIX/drive_c" ]; then
  as_mt5 env WINEDLLOVERRIDES="mscoree,mshtml=" wineboot -u
else
  as_mt5 env WINEDLLOVERRIDES="mscoree,mshtml=" wineboot --init
fi
as_mt5 wineserver -w || true

mkdir -p "$DL"
fetch() { [ -s "$DL/$1" ] || curl -fsSL --retry 3 -o "$DL/$1" "$2"; chmod 0644 "$DL/$1"; }

say "MT5 terminal (MetaQuotes' own installer)"
if [ ! -f "$PREFIX/drive_c/Program Files/MetaTrader 5/terminal64.exe" ]; then
  fetch mt5setup.exe https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe
  # /auto installs without questions; it starts the terminal at the end, so stop it after.
  timeout 900 sudo -u mt5 env HOME=/home/mt5 WINEPREFIX="$PREFIX" WINEDEBUG=-all DISPLAY=:99 wine "$DL/mt5setup.exe" /auto || true
  as_mt5 wineserver -k || true
  [ -f "$PREFIX/drive_c/Program Files/MetaTrader 5/terminal64.exe" ] || { echo "MT5 install did not finish; run this script again"; exit 1; }
fi

say "Windows Python $PY_VERSION in the same prefix"
if [ ! -f "$PREFIX/drive_c/Program Files/Python311/python.exe" ]; then
  fetch "python-$PY_VERSION-amd64.exe" "https://www.python.org/ftp/python/$PY_VERSION/python-$PY_VERSION-amd64.exe"
  as_mt5 wine "$DL/python-$PY_VERSION-amd64.exe" /quiet InstallAllUsers=1 PrependPath=0 Include_test=0
  as_mt5 wineserver -w || true
fi
# Windows Python under Wine stops at start-up ("init_sys_streams ... [WinError 6]
# Invalid handle") when its output goes to a file, as it does when this script runs
# with `> log`. A pipe works, so its output goes through cat. pipefail keeps a pip
# failure a failure.
as_mt5 wine "$PY_EXE" -m pip install --disable-pip-version-check -q -r 'Z:\opt\mt5-bridge\requirements.txt' 2>&1 | cat
as_mt5 wine "$PY_EXE" -c "import numpy, MetaTrader5, fastapi, uvicorn; print('bridge packages import:', 'numpy', numpy.__version__, 'MetaTrader5', MetaTrader5.__version__)" 2>&1 | cat

say "terminal and bridge services"
install -m 0755 "$APP/deploy/mt5-host-metrics" /usr/local/bin/mt5-host-metrics
install -d -o mt5 -g mt5 -m 0755 /opt/mt5-bridge/var
install -m 0644 "$APP/deploy/mt5-terminal.service" "$APP/deploy/mt5-bridge.service" \
  "$APP/deploy/mt5-bridge-watchdog.service" "$APP/deploy/mt5-bridge-watchdog.timer" \
  "$APP/deploy/mt5-bridge-metrics.service" "$APP/deploy/mt5-bridge-metrics.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mt5-terminal mt5-bridge >/dev/null
# Restarts the bridge when it stops answering (deploy/watchdog.sh).
systemctl enable --now mt5-bridge-watchdog.timer >/dev/null
# Linux-side CPU/RAM/disk snapshot for GET /host/metrics (does not touch MT5).
systemctl enable --now mt5-bridge-metrics.timer >/dev/null

say "check"
for _ in $(seq 1 30); do
  if out=$(curl -fsS http://127.0.0.1:8765/health 2>/dev/null); then echo "health: $out"; break; fi
  sleep 2
done
echo
echo "Done. Until Luka logs in (README step 5) health says ok=false: the terminal is not connected yet."
echo "Orders stay refused: MT5_BRIDGE_TRADING=off in $ENV_FILE."
