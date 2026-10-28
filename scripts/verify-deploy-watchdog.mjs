/**
 * De gratis helft van het toezicht.
 *
 * Luka vroeg of er meer automatische sessies bij kunnen, met het idee dat zijn
 * abonnementen dat wel moeten kunnen dragen. De schaarse grondstof blijkt niet
 * geld maar het vijf-uurs limiet op één account — gemeten op de nachtrun van
 * 28 oktober: `rateLimitType: "five_hour"`, $0,80 aan equivalent per cyclus.
 *
 * Dus is de winst niet "meer sessies" maar "minder sessie-tijd aan werk dat
 * geen model nodig heeft". De autopilot begon elke cyclus met kijken of
 * productie bij is en de checks groen zijn. Dat kan een shell-script elke tien
 * minuten gratis doen. De beslissing staat in `src/lib/ops/deployDrift.ts` en
 * deze checks houden hem eerlijk — want een wachthond die bij alles blaft
 * wordt net zo snel genegeerd als een melding die niets zegt.
 *
 * Run: node scripts/verify-deploy-watchdog.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DEPLOY_GRACE_MINUTES, judgeDeployDrift } from "../src/lib/ops/deployDrift.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const NOW = Date.parse("2026-10-28T12:00:00Z");
const minutesAgo = (m) => new Date(NOW - m * 60000).toISOString();

const state = (over = {}) => ({
  expectedCommit: "98726d02fcf443a8c1c56e3083de9f8d0bca5b8e",
  servingCommit: "98726d02fcf443a8c1c56e3083de9f8d0bca5b8e",
  builtAt: minutesAgo(5),
  lastPushAt: minutesAgo(8),
  ...over,
});

console.log("wanneer niemand hoeft te kijken");

check("productie draait wat er op main staat", () => {
  const v = judgeDeployDrift(state(), NOW);
  assert.equal(v.level, "ok");
  assert.equal(v.needsAttention, false);
  assert.match(v.message, /98726d0/);
  assert.match(v.message, /5 min geleden/);
});

check("de volledige hash en de korte vorm zijn dezelfde commit", () => {
  // Het endpoint geeft er beide. Een vergelijking die van het formaat afhangt
  // valt stilletjes om zodra iemand het formaat verandert.
  const v = judgeDeployDrift(state({ servingCommit: "98726d0" }), NOW);
  assert.equal(v.level, "ok");
  const upper = judgeDeployDrift(state({ servingCommit: "98726D02FCF443A8" }), NOW);
  assert.equal(upper.level, "ok", "en hoofdletters zijn geen andere commit");
});

check("de eerste minuten na een push is achterlopen juist normaal", () => {
  const v = judgeDeployDrift(
    state({ servingCommit: "eafac620b1e95d4fb60503ea5d604e3b9ebd2b11", lastPushAt: minutesAgo(3) }),
    NOW,
  );
  assert.equal(v.level, "waiting");
  assert.equal(v.needsAttention, false, "hier blaffen maakt de wachthond nutteloos");
  assert.match(v.message, /dat is normaal/);
});

check("de grens zit waar hij hoort, en net erna is het wel raar", () => {
  const onEdge = judgeDeployDrift(
    state({ servingCommit: "eafac62", lastPushAt: minutesAgo(DEPLOY_GRACE_MINUTES) }),
    NOW,
  );
  assert.equal(onEdge.level, "waiting", "precies op de grens is nog geduld");

  const past = judgeDeployDrift(
    state({ servingCommit: "eafac62", lastPushAt: minutesAgo(DEPLOY_GRACE_MINUTES + 1) }),
    NOW,
  );
  assert.equal(past.level, "stale");
  assert.equal(past.needsAttention, true);
});

console.log("\nwanneer er wel iemand moet kijken");

check("een build die faalt ziet er precies zo uit, en zegt waar te lezen", () => {
  // Een mislukte build herstart niets en het oude proces blijft doorserveren.
  // Dat is de stille mislukking die dit hele endpoint bestaat om te vangen.
  const v = judgeDeployDrift(state({ servingCommit: "eafac62", lastPushAt: minutesAgo(90) }), NOW);
  assert.equal(v.level, "stale");
  assert.match(v.message, /al 90 min/);
  assert.match(v.message, /axe-autodeploy\.log/, "zeg waar het antwoord staat, niet alleen dat er iets is");
});

check("geen antwoord van productie is niet hetzelfde als bij", () => {
  const v = judgeDeployDrift(state({ servingCommit: null, builtAt: null }), NOW);
  assert.equal(v.level, "unreachable");
  assert.equal(v.needsAttention, true);
  assert.match(v.message, /antwoordde niet/);
});

check("niet weten wat er op main staat is ook een probleem", () => {
  const v = judgeDeployDrift(state({ expectedCommit: "" }), NOW);
  assert.equal(v.level, "unreachable");
  assert.equal(v.needsAttention, true);
});

check("een onleesbare of ontbrekende tijd leidt niet tot geduld dat niemand verdiende", () => {
  // Zonder push-tijd kan "hoe lang al" niet berekend worden. Dan is achterlopen
  // verdacht, niet normaal: geduld geven op een onbekende duur is precies hoe
  // een vastgelopen deploy dagen onopgemerkt blijft.
  for (const bad of [null, "", "ooit", "niet-een-datum"]) {
    const v = judgeDeployDrift(state({ servingCommit: "eafac62", lastPushAt: bad }), NOW);
    assert.equal(v.level, "stale", `lastPushAt ${JSON.stringify(bad)} moet verdacht zijn`);
    assert.equal(v.needsAttention, true);
  }
});

check("een onleesbare bouwtijd haalt de melding niet onderuit", () => {
  const v = judgeDeployDrift(state({ builtAt: "onzin" }), NOW);
  assert.equal(v.level, "ok", "de commits kloppen, dat is wat telt");
  assert.ok(!/NaN/.test(v.message), "en er staat nooit NaN in wat een mens leest");
});

check("alleen 'ok' en 'waiting' laten iemand doorslapen", () => {
  for (const level of ["ok", "waiting"]) {
    const found = [
      judgeDeployDrift(state(), NOW),
      judgeDeployDrift(state({ servingCommit: "eafac62", lastPushAt: minutesAgo(2) }), NOW),
    ].find((v) => v.level === level);
    assert.ok(found && found.needsAttention === false, `${level} mag niet wekken`);
  }
  for (const v of [
    judgeDeployDrift(state({ servingCommit: "eafac62", lastPushAt: minutesAgo(99) }), NOW),
    judgeDeployDrift(state({ servingCommit: null }), NOW),
  ]) {
    assert.equal(v.needsAttention, true, `${v.level} moet wel wekken`);
  }
});

console.log("\nde schil eromheen");

const sh = readFileSync("scripts/watchdog.sh", "utf8");

check("het script kost niets: geen model, geen API-sleutel", () => {
  assert.ok(!/ANTHROPIC|OPENAI_API_KEY|ollama|claude/i.test(sh.replace(/^#.*$/gm, "")));
  assert.ok(/judgeDeployDrift/.test(sh), "het leent de beslissing, bouwt geen tweede");
});

check("het exit non-zero als er iemand moet kijken", () => {
  assert.ok(/exit 1/.test(sh));
  assert.ok(/exit 0/.test(sh));
  assert.ok(/needsAttention/.test(sh), "en het leest dat uit de beslissing, niet uit de tekst");
});

check("de zware checks staan standaard uit", () => {
  // Een koude typecheck plus de hele suite elke tien minuten op een bak die
  // ook Ollama en de workers draait is geen toezicht, dat is een tweede last.
  assert.ok(/AXE_WATCHDOG_CHECKS:-0/.test(sh));
  assert.ok(/RUN_CHECKS" = "1"/.test(sh));
});

check("één mislukte curl is geen alarm, want dat is elke deploy", () => {
  // Hier shipte ik precies de fout waar de checks hierboven tegen geschreven
  // zijn. Om 06:32 op 28 oktober meldde deze wachthond "productie antwoordde
  // niet" terwijl de deploy van 5d3e0b9 op dat moment de service herstartte;
  // negen seconden later antwoordde hij gewoon. Ik had de beslissing getest en
  // het ophalen niet, en zonder deze check zou hij zes keer per dag valselijk
  // blaffen tot niemand hem meer leest.
  assert.ok(/for attempt in 1 2 3/.test(sh), "meerdere pogingen voor hij het opgeeft");
  assert.ok(/sleep 8/.test(sh), "met tijd ertussen, want een herstart duurt tien tot dertig seconden");
  const fetchBlock = sh.slice(sh.indexOf("BODY=\"\""), sh.indexOf("VERDICT="));
  assert.ok(/break/.test(fetchBlock), "en het stopt zodra er antwoord is");
});

check("het zegt in zijn eigen kop hoe je het aanzet", () => {
  assert.ok(/crontab|\* \* \* \*/.test(sh), "een runbook dat je moet zoeken is geen runbook");
  assert.ok(/axe-watchdog\.log/.test(sh));
});

console.log(`\n${passed} checks passed`);
