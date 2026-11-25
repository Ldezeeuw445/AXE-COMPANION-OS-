#!/usr/bin/env bash
# Turn the bridge on for Companion and Trading OS, from the Mac, after install.sh
# ran on the box, Luka logged in to the terminal and the Cloudflare tunnel is up.
#
#   bash services/mt5-bridge/deploy/activate.sh BRIDGE_HOST https://mt5-bridge.example.com
#
# 1. checks the bridge answers through the tunnel and is logged in;
# 2. copies its token (never printed, never an argument) to
#    - Companion's VPS env (/root/AXE-COMPANION-OS-/.env.local) and restarts it,
#    - the Supabase secrets Trading OS's engine-proxy and alert-eval read;
# 3. prints the one SQL that points the account at the bridge. That last
#    step changes where the live account's data comes from, so it is not run
#    here: Luka says yes, then it is run.
set -euo pipefail

BRIDGE_HOST="${1:?bridge box IP or host}"
BRIDGE_URL="${2:?public bridge URL, e.g. https://mt5-bridge.example.com}"
BRIDGE_URL="${BRIDGE_URL%/}"
COMPANION_HOST="${COMPANION_HOST:-212.227.91.79}"
SUPABASE_REF="${SUPABASE_REF:-pqnngpcgbdwxavbatbia}"
KEY="${BRIDGE_SSH_KEY:-$HOME/.ssh/mt5_bridge}"
# user_broker_accounts.id of the Upcomers account. Reconnecting it in Companion on
# 24 Nov 2026 made a new row (the 21 Nov one, d75fb5ac-…, is gone).
ROW_ID="${ROW_ID:-3f38709a-f2f2-40e4-abf1-172e38999498}"

say() { printf '\n== %s\n' "$*"; }

say "token from the box"
ENV_LINES=$(ssh -i "$KEY" -o BatchMode=yes "root@$BRIDGE_HOST" "grep -E '^(MT5_BRIDGE_TOKEN|MT5_BRIDGE_ACCOUNT_ID)=' /etc/mt5-bridge.env")
TOKEN=$(printf '%s\n' "$ENV_LINES" | sed -n 's/^MT5_BRIDGE_TOKEN=//p')
ACCOUNT=$(printf '%s\n' "$ENV_LINES" | sed -n 's/^MT5_BRIDGE_ACCOUNT_ID=//p')
[ "${#TOKEN}" -ge 32 ] || { echo "no usable token in /etc/mt5-bridge.env"; exit 1; }
echo "account id: $ACCOUNT (token read, ${#TOKEN} chars, not shown)"

say "bridge through the tunnel"
HEALTH=$(curl -fsS --max-time 15 "$BRIDGE_URL/health") || { echo "no answer from $BRIDGE_URL/health"; exit 1; }
echo "health: $HEALTH"
STATUS=$(curl -fsS --max-time 15 -H "auth-token: $TOKEN" "$BRIDGE_URL/status") || { echo "/status refused the token"; exit 1; }
echo "status: $STATUS"
printf '%s' "$HEALTH" | grep -q '"ok": *true' || { echo "terminal not connected yet: log in over VNC first (README step 5)"; exit 1; }

say "Companion env on $COMPANION_HOST"
# Values go over stdin; the remote side rewrites only these three lines, with a backup.
printf 'MT5_BRIDGE_URL=%s\nMT5_BRIDGE_TOKEN=%s\nMT5_BRIDGE_ACCOUNT_ID=%s\n' "$BRIDGE_URL" "$TOKEN" "$ACCOUNT" |
  ssh -o BatchMode=yes "root@$COMPANION_HOST" 'set -e
    F=/root/AXE-COMPANION-OS-/.env.local
    cp -p "$F" "$F.bak-$(date +%Y%m%d-%H%M%S)"
    python3 -c "
import re, sys
path = sys.argv[1]
new = dict(l.split(\"=\", 1) for l in sys.stdin.read().splitlines() if \"=\" in l)
lines = open(path).read().split(\"\\n\")
for i, l in enumerate(lines):
    k = l.split(\"=\", 1)[0]
    if k in new:
        lines[i] = k + \"=\" + new.pop(k)
if lines and lines[-1] == \"\":
    lines.pop()
lines += [k + \"=\" + v for k, v in new.items()]
open(path, \"w\").write(\"\\n\".join(lines) + \"\\n\")
" "$F"
    systemctl restart axe-companion
    echo "env updated, axe-companion restarted"'

say "Supabase secrets for Trading OS ($SUPABASE_REF)"
TMP=$(mktemp)
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT
printf 'MT5_BRIDGE_URL=%s\nMT5_BRIDGE_TOKEN=%s\n' "$BRIDGE_URL" "$TOKEN" > "$TMP"
# The same pinned CLI as Trading OS's release script: version 3 hangs without a
# terminal to ask in.
npx --yes "${SUPABASE_CLI:-supabase@2.122.1}" secrets set --env-file "$TMP" --project-ref "$SUPABASE_REF" >/dev/null
echo "secrets set (functions pick them up on their next cold start)"

say "last step, only after Luka's yes"
cat <<SQL
-- Points the Upcomers account at the bridge for Companion AND Trading OS
-- (same table, same project). Run it in Supabase's SQL editor, or ask Claude.
update public.user_broker_accounts
   set external_connection_id = '$ACCOUNT',
       metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object('metaapiRegion', 'bridge',
                                        'previousMetaapiAccountId', external_connection_id,
                                        'previousMetaapiRegion', metadata->>'metaapiRegion')
 where id = '$ROW_ID'               -- the active Upcomers row (MetaApi 1e9bf1a0)
   and connection_method = 'cloud_mt5';
-- Back to MetaApi: external_connection_id = metadata->>'previousMetaapiAccountId',
-- metaapiRegion = metadata->>'previousMetaapiRegion'.
SQL
