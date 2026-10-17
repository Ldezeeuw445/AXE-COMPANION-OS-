#!/usr/bin/env bash
#
# AXE Companion — deploy to the VPS.
#
# Run on the host, from anywhere:  /root/AXE-COMPANION-OS-/deploy.sh [branch]
#
# Defaults to the branch already checked out. Stops at the first failure rather
# than restarting a service on top of a build that did not finish — a failed
# build otherwise leaves the old process happily serving and the deploy looks
# like it worked.
set -euo pipefail

APP_DIR="/root/AXE-COMPANION-OS-"
SERVICE="axe-companion"
PROBE_URL="https://www.axecompanion.com/robots.txt"
# Only exists from the audit branch onward, so it distinguishes "new build is
# live" from "old process is still answering".
HEAVY_NEIGHBOUR="axe-browser-agent"

cd "$APP_DIR"

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
echo "→ fetching $BRANCH"
git fetch origin "$BRANCH"

BEFORE="$(git rev-parse --short HEAD)"
git merge --ff-only FETCH_HEAD
AFTER="$(git rev-parse --short HEAD)"
echo "→ $BEFORE → $AFTER"

echo "→ installing"
npm ci

echo "→ building"
# From a clean slate. Turbopack's incremental cache has been observed shipping
# a stale globals.css into a fresh chunk — the Tailwind utilities regenerate,
# the hand-written :root block does not — which on a deploy means CSS changes
# silently do not land. A cold build costs a couple of minutes; debugging a
# style that "did not deploy" costs an evening.
rm -rf .next
# The box also runs Ollama, the API and the workers; the unit caps the app at
# 3G, and a build on top of all of that can be killed. Standing the heaviest
# neighbour down for the build is cheaper than a half-finished deploy.
if ! npm run build; then
  echo "→ build failed; retrying without $HEAVY_NEIGHBOUR"
  systemctl stop "$HEAVY_NEIGHBOUR" || true
  trap 'systemctl start "$HEAVY_NEIGHBOUR" || true' EXIT
  npm run build
fi

echo "→ restarting $SERVICE"
systemctl restart "$SERVICE"

echo "→ waiting for the app to answer"
for _ in $(seq 1 30); do
  CODE="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$PROBE_URL" || true)"
  [ "$CODE" = "200" ] && break
  sleep 2
done

echo
if [ "${CODE:-}" = "200" ]; then
  echo "✓ deployed and live at $AFTER"
else
  echo "✗ app answered $CODE — the build may not have landed"
  echo "  journalctl -u $SERVICE -n 50 --no-pager"
  exit 1
fi
