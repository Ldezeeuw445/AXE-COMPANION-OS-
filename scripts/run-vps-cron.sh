#!/usr/bin/env bash
# Hit a Next cron route on localhost. Used by scripts/vps.crontab on the IONOS host.
# Usage: ./scripts/run-vps-cron.sh /api/cron/mt5-sync
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JOB="${1:?usage: run-vps-cron.sh /api/cron/<name>}"
PORT="${PORT:-5000}"

read_secret() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  grep -E '^CRON_SECRET=' "$file" | tail -1 | cut -d= -f2- | tr -d '[:space:]' | tr -d '"' | tr -d "'"
}

CRON_SECRET="${CRON_SECRET:-}"
if [[ -z "$CRON_SECRET" ]]; then
  for f in "$ROOT/.env.local" "$ROOT/.env" /etc/axe-companion.env; do
    CRON_SECRET="$(read_secret "$f" || true)"
    [[ -n "$CRON_SECRET" ]] && break
  done
fi
if [[ -z "$CRON_SECRET" ]]; then
  echo "CRON_SECRET missing (set env or put it in $ROOT/.env.local)" >&2
  exit 1
fi

curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" \
  "http://127.0.0.1:${PORT}${JOB}"
echo
