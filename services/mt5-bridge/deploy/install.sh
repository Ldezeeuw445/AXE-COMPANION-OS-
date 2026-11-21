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
apt-get install -y -qq wine wine64 wine32:i386 xvfb x11vnc winbind cabextract curl ca-certificates ufw unattended-upgrades >/dev/null

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
MT5_TERMINAL_PATH=$TERMINAL_EXE
EOF
  umask 022
fi
chown root:mt5 "$ENV_FILE" && chmod 0640 "$ENV_FILE"

say "virtual screen"
install -m 0644 "$APP/deploy/mt5-xvfb.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mt5-xvfb >/dev/null
sleep 2

say "Wine prefix"
[ -d "$PREFIX/drive_c" ] || as_mt5 wineboot --init
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
as_mt5 wine "$PY_EXE" -m pip install --disable-pip-version-check -q -r 'Z:\opt\mt5-bridge\requirements.txt'

say "terminal and bridge services"
install -m 0644 "$APP/deploy/mt5-terminal.service" "$APP/deploy/mt5-bridge.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mt5-terminal mt5-bridge >/dev/null

say "check"
for _ in $(seq 1 30); do
  if out=$(curl -fsS http://127.0.0.1:8765/health 2>/dev/null); then echo "health: $out"; break; fi
  sleep 2
done
echo
echo "Done. Until Luka logs in (README step 5) health says ok=false: the terminal is not connected yet."
echo "Orders stay refused: MT5_BRIDGE_TRADING=off in $ENV_FILE."
