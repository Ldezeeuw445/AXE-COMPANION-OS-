#!/usr/bin/env bash
# Run this ON the IONOS Ubuntu host (www.axecompanion.com), from the app repo.
# This is the production deploy path. Do not use Vercel.
#
# Usage:
#   ./scripts/deploy-vps.sh cursor/chart-websocket-live-c844
#   ./scripts/deploy-vps.sh main
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REF="${1:-}"
if [[ -z "$REF" ]]; then
  echo "Usage: $0 <git-ref>" >&2
  echo "  $0 cursor/chart-websocket-live-c844" >&2
  echo "  $0 main" >&2
  exit 1
fi

echo "==> repo $ROOT"
echo "==> checkout $REF"

git fetch origin
git checkout "$REF"
git pull --ff-only origin "$REF"

echo "==> install + build (Node 22)"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi
node -v
npm ci
npm run build

restart_next() {
  if command -v pm2 >/dev/null 2>&1; then
    for name in axe-companion axe companion tradingos-companion next; do
      if pm2 describe "$name" >/dev/null 2>&1; then
        echo "==> pm2 restart $name"
        pm2 restart "$name"
        return 0
      fi
    done
  fi
  for unit in axe-companion axe; do
    if systemctl is-active --quiet "$unit" 2>/dev/null; then
      echo "==> systemctl restart $unit"
      sudo systemctl restart "$unit"
      return 0
    fi
  done
  return 1
}

echo "==> restart Next"
if restart_next; then
  echo "==> restarted"
else
  echo "Build is ready. Restart the process that owns port 5000 yourself:"
  echo "  ss -tlnp | grep 5000"
  echo "  npm run start"
fi

echo "==> done. On the phone: hard-refresh / reopen the PWA, open Chart, badge should say WS."
echo "If it still says SSE, nginx must forward WebSocket upgrades (see docs/vps-deploy.md)."
