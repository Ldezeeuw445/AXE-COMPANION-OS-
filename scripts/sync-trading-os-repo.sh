#!/usr/bin/env bash
# Push the trading-os/ folder to TRADING-AXE-OS-APPS/TRADING-OS-
# Prerequisite: create the empty repo at https://github.com/TRADING-AXE-OS-APPS/TRADING-OS-

set -euo pipefail

REPO="${1:-https://github.com/TRADING-AXE-OS-APPS/TRADING-OS-.git}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "Cloning $REPO into temp workdir..."
git clone "$REPO" "$WORKDIR/repo"
rsync -a --delete \
  --exclude node_modules \
  --exclude .next \
  /workspace/trading-os/ "$WORKDIR/repo/"

cd "$WORKDIR/repo"
git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit."
  exit 0
fi

git commit -m "chore: sync Trading OS landing app from AXE-COMPANION-OS- monorepo"
git push origin HEAD:main
echo "Done — pushed to $REPO"
