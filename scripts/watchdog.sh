#!/usr/bin/env bash
#
# Kijkt of productie draait wat er op main staat, en of de checks groen zijn.
# Geen model, geen API, geen kosten. Bedoeld voor een cron op de VPS:
#
#   */10 * * * * /root/AXE-COMPANION-OS-/scripts/watchdog.sh >> /var/log/axe-watchdog.log 2>&1
#
# Waarom dit bestaat: de autopilot-sessie begon elke cyclus met precies deze
# controles, en dat kost een deel van het vijf-uurs limiet dat anders aan
# bouwen was besteed. Een shell-script kan het gratis, elke tien minuten in
# plaats van elke vier uur, en pas als er iets mis is hoeft er een sessie aan
# te pas te komen.
#
# Exit 0  = alles in orde (of een deploy die nog aan het landen is)
# Exit 1  = er moet iemand kijken
set -uo pipefail

REPO="${AXE_REPO_DIR:-/root/AXE-COMPANION-OS-}"
BUILD_URL="${AXE_BUILD_URL:-https://www.axecompanion.com/api/debug/build}"
RUN_CHECKS="${AXE_WATCHDOG_CHECKS:-0}"

cd "$REPO" || { echo "$(date -u +%FT%TZ) FOUT: $REPO bestaat niet"; exit 1; }

stamp() { date -u +%FT%TZ; }

# ── Loopt productie achter? ───────────────────────────────────────────────
git fetch origin main --quiet 2>/dev/null
EXPECTED="$(git rev-parse origin/main 2>/dev/null || true)"
# Het moment van de laatste commit op main is de beste schatting van "wanneer
# is er gepusht" die we zonder de GitHub API hebben.
LAST_PUSH="$(git log -1 --format=%cI origin/main 2>/dev/null || true)"
# Drie pogingen, acht seconden ertussen.
#
# Eén curl was niet genoeg en dat bleek meteen: om 06:32 op 28 oktober meldde
# deze wachthond "productie antwoordde niet" terwijl de deploy van 5d3e0b9 juist
# op dat moment de service herstartte. Negen seconden later antwoordde hij
# gewoon. Een wachthond die bij elke deploy blaft — zes keer per dag — is binnen
# een week een wachthond die niemand meer leest, en dat is precies de fout
# waartegen de checks in verify-deploy-watchdog.mjs geschreven zijn.
#
# Het herstart-venster is tien tot dertig seconden, dus drie pogingen over
# ongeveer twintig seconden dekken het. Blijft het daarna stil, dan is er echt
# iets.
BODY=""
for attempt in 1 2 3; do
  BODY="$(curl -sf -m 15 "$BUILD_URL" 2>/dev/null || true)"
  [ -n "$BODY" ] && break
  [ "$attempt" -lt 3 ] && sleep 8
done

VERDICT="$(
  AXE_EXPECTED="$EXPECTED" AXE_LAST_PUSH="$LAST_PUSH" AXE_BODY="$BODY" \
  npx --no-install tsx -e '
    import { judgeDeployDrift } from "./src/lib/ops/deployDrift.ts";
    let serving = null, builtAt = null;
    try {
      const b = JSON.parse(process.env.AXE_BODY || "{}");
      serving = b.commit ?? b.shortCommit ?? null;
      builtAt = b.builtAt ?? null;
    } catch { /* geen antwoord of geen JSON: blijft null */ }
    const v = judgeDeployDrift({
      expectedCommit: process.env.AXE_EXPECTED || "",
      servingCommit: serving,
      builtAt,
      lastPushAt: process.env.AXE_LAST_PUSH || null,
    });
    process.stdout.write(`${v.level}\t${v.needsAttention ? "1" : "0"}\t${v.message}`);
  ' 2>/dev/null || printf "unreachable\t1\tKon de drift-check niet uitvoeren."
)"

LEVEL="$(printf '%s' "$VERDICT" | cut -f1)"
ATTENTION="$(printf '%s' "$VERDICT" | cut -f2)"
MESSAGE="$(printf '%s' "$VERDICT" | cut -f3-)"
echo "$(stamp) deploy[$LEVEL] $MESSAGE"

FAIL=0
[ "$ATTENTION" = "1" ] && FAIL=1

# ── Zijn de checks groen? ─────────────────────────────────────────────────
# Standaard uit: dit draait een koude typecheck en de hele suite, en dat is te
# zwaar voor elke tien minuten op een bak die ook Ollama en de workers draait.
# Zet AXE_WATCHDOG_CHECKS=1 in een losse cron, bijvoorbeeld één keer per nacht.
if [ "$RUN_CHECKS" = "1" ]; then
  for step in "npx tsc --noEmit" "npm test" "npm run verify"; do
    if out="$($step 2>&1)"; then
      echo "$(stamp) ok   $step"
    else
      echo "$(stamp) ROOD $step"
      printf '%s\n' "$out" | tail -20
      FAIL=1
    fi
  done
fi

if [ "$FAIL" = "1" ]; then
  echo "$(stamp) --> er moet iemand kijken"
  exit 1
fi
echo "$(stamp) --> niets te doen"
exit 0
