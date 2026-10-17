#!/usr/bin/env bash
#
# Zet de autodeploy aan op deze box. Eén keer draaien, daarna gaat het vanzelf.
#
#   bash scripts/install-autodeploy.sh <branch>
#
# Idempotent: een bestaande regel wordt vervangen, niet verdubbeld. Een tweede
# keer draaien is dus veilig -- wat je niet kunt zeggen van `crontab -e` met de
# hand, waar een dubbele regel twee builds tegelijk start.
set -euo pipefail

# De repo waar we in staan, en pas anders het pad van dit script.
#
# Dit script wordt bedoeld gepijpt gedraaid (`git show ... | bash`), en dan is
# `$0` gewoon "bash" -- `dirname "$0"` wijst dan naar de verkeerde map en het
# geheel faalt met "not a git repository". Vandaar eerst de git-wortel van waar
# je staat; die klopt in beide gevallen.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$ROOT" ] || ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${1:-$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)}"
MERK="# axe-companion autodeploy"
REGEL="*/5 * * * * $ROOT/scripts/autodeploy.sh >> /var/log/axe-autodeploy.log 2>&1 $MERK"

echo "$BRANCH" > /etc/axe-autodeploy.branch
touch /var/log/axe-autodeploy.log

# Het script zelf van de branch halen -- de box staat op een oudere commit en
# heeft het nog niet. Alleen DIT bestand, geen merge: een merge zou HEAD
# vooruit zetten, en dan ziet de eerste autodeploy-run "niets nieuws" en bouwt
# hij nooit. De echte deploy doet autodeploy.sh hieronder, zoals elke andere.
git -C "$ROOT" fetch origin "$BRANCH" --quiet
git -C "$ROOT" checkout "origin/$BRANCH" -- scripts/autodeploy.sh
chmod +x "$ROOT/scripts/autodeploy.sh"

# De bestaande regel eruit, de nieuwe erin. `|| true` want een lege crontab
# laat `crontab -l` met 1 afsluiten, en dat is hier geen fout.
( crontab -l 2>/dev/null | grep -vF "$MERK" || true; echo "$REGEL" ) | crontab -

echo "autodeploy staat aan"
echo "  branch : $BRANCH"
echo "  repo   : $ROOT"
echo "  ritme  : elke 5 minuten, alleen als de branch verschoven is"
echo "  log    : /var/log/axe-autodeploy.log"
echo
echo "Nu meteen één keer draaien:"
"$ROOT/scripts/autodeploy.sh" "$BRANCH" || echo "  (eerste run gaf een foutcode — lees het log hierboven)"
