#!/usr/bin/env bash
#
# Zet live wat er op de gevolgde branch staat — maar alleen als het bouwt.
#
# ## Waarom dit bestaat
#
# De deploy was een handeling op de box: iemand moest in een terminal
# `deploy-vps.sh` draaien. Dat werkte, tot Luka alleen zijn telefoon had.
# Werk van 28 september stond twaalf dagen later nog niet live, niet omdat er
# iets stuk was maar omdat er niemand bij een shell kon.
#
# ## De regel die hier nooit mag sneuvelen
#
# Een mislukte build herstart NIETS. Het oude proces blijft vrolijk draaien en
# blijft serveren wat het serveerde. Dat is met opzet: een halve deploy die de
# site plat legt is erger dan een deploy die niet doorging, en de logregel
# hieronder vertelt wat er aan de hand is.
#
# Daarom `set -e` én expliciete volgorde: fetch, merge, install, build, en pas
# daarna herstarten.
#
# ## Koud bouwen
#
# `rm -rf .next` staat er omdat Turbopack's cache ooit een verouderde
# globals.css meeleverde: de Tailwind-utilities werden opnieuw gegenereerd,
# het handgeschreven :root-blok niet. Een CSS-wijziging landde dan stil niet.
# Zie de notitie in deploy.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="${1:-$(cat /etc/axe-autodeploy.branch 2>/dev/null || git rev-parse --abbrev-ref HEAD)}"
LOG="/var/log/axe-autodeploy.log"
LOCK="/tmp/axe-autodeploy.lock"
# Wat er WERKELIJK draait. Niet HEAD: een mislukte build laat HEAD vooruit
# staan terwijl het oude proces nog serveert. Vergeleken we dan met HEAD, dan
# zag de volgende run "niets nieuws" en probeerde het nooit meer -- de site
# blijft stil op oude code en het log zwijgt. Precies de faalwijze waar dit
# script voor gemaakt is.
LIVE_BESTAND="$ROOT/.git/axe-autodeploy-live"

zeg() { echo "$(date -Is) $*" | tee -a "$LOG"; }

# Twee builds tegelijk op een box met 3G geheugen is één build die gedood
# wordt en één die er niets van begrijpt.
exec 9>"$LOCK"
flock -n 9 || exit 0

git fetch origin "$BRANCH" --quiet
LIVE="$(cat "$LIVE_BESTAND" 2>/dev/null || git rev-parse HEAD)"
NIEUW="$(git rev-parse "origin/$BRANCH")"
[ "$LIVE" = "$NIEUW" ] && exit 0

zeg "nieuw op $BRANCH: ${LIVE:0:7} -> ${NIEUW:0:7}"

# --ff-only: komt er iets op de box dat niet op de branch staat, dan hoort dit
# te STOPPEN en niet stilzwijgend te mergen waar niemand meekijkt.
if ! git merge --ff-only "origin/$BRANCH" >>"$LOG" 2>&1; then
  zeg "GESTOPT: kan niet fast-forwarden. Er staat werk op de box dat niet op $BRANCH staat."
  exit 1
fi

npm ci --silent >>"$LOG" 2>&1
rm -rf .next
if ! npm run build >>"$LOG" 2>&1; then
  zeg "BUILD MISLUKT op ${NIEUW:0:7} — oude versie blijft draaien. Zie $LOG"
  exit 1
fi

systemctl restart axe-companion
# Pas NU vastleggen wat er live staat: na een geslaagde build en een herstart.
echo "$NIEUW" > "$LIVE_BESTAND"
zeg "live: ${NIEUW:0:7}"
