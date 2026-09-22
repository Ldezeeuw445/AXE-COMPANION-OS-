#!/usr/bin/env bash
# Set one secret in the VPS app env without it appearing anywhere it should not.
#
# Run ON the VPS:  ./scripts/set-secret.sh STRIPE_SECRET_KEY
#
# The value is read with the terminal echo off, so it is not shown, not stored
# in shell history, and not passed as an argument (which `ps` would expose).
# Existing values are backed up before the file is rewritten.
#
# NEXT_PUBLIC_* values are compiled into the bundle: after setting one, run
# ./deploy.sh deployed instead of only restarting.
set -euo pipefail

ENV_FILE="/root/AXE-COMPANION-OS-/.env.local"
NAME="${1:-}"

if [[ -z "$NAME" ]]; then
  echo "Usage: $0 <ENV_VAR_NAME>" >&2
  exit 1
fi
if [[ ! "$NAME" =~ ^[A-Z0-9_]+$ ]]; then
  echo "Name must be upper snake case, e.g. STRIPE_SECRET_KEY" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "No $ENV_FILE on this machine — run this on the VPS." >&2
  exit 1
fi

read -r -s -p "Value for $NAME (input hidden): " VALUE
echo
if [[ -z "$VALUE" ]]; then
  echo "Empty value — nothing changed." >&2
  exit 1
fi

BACKUP="$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$ENV_FILE" "$BACKUP"

NAME="$NAME" VALUE="$VALUE" python3 - "$ENV_FILE" <<'PY'
import os, re, sys
path, name, value = sys.argv[1], os.environ["NAME"], os.environ["VALUE"]
lines = open(path).read().split("\n")
replaced = False
for i, line in enumerate(lines):
    if re.match(rf"^{re.escape(name)}=", line):
        lines[i] = f"{name}={value}"
        replaced = True
        break
if not replaced:
    lines.append(f"{name}={value}")
open(path, "w").write("\n".join(lines))
print(("replaced" if replaced else "appended") + f" {name}")
PY

unset VALUE
echo "backup: $BACKUP"
echo
if [[ "$NAME" == NEXT_PUBLIC_* ]]; then
  echo "NEXT_PUBLIC_* is baked in at build time — run: ./deploy.sh deployed"
else
  echo "Apply with: systemctl restart axe-companion"
fi
