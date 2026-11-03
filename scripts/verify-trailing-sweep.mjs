/**
 * De bewaker die de stop verbetert naar een plek waar hij al niet meer stond.
 *
 * Punt 15 van de rij. `advancedOrders.ts` zegt waar de stop heen moet;
 * `trailingSweep.ts` zegt of hij verzet moet worden. De fouten zitten niet in
 * de rekensom maar in wat de bewaker gelooft.
 *
 * Wij noteren welke stop we gezet hebben. Maar de broker heeft het laatste
 * woord: een modify kan geweigerd zijn en de trader kan hem met de hand
 * verzet hebben. Rekent de bewaker vanaf ons eigen briefje, dan "verbetert"
 * hij een stop naar een plek waar die al niet meer staat — en dan denkt de
 * trader dat hij beschermd is op een niveau dat nergens bestaat.
 *
 * Run: node scripts/verify-trailing-sweep.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  decideTrailingSweep,
  summarizeSweep,
} from "../src/lib/trading/trailingSweep.ts";

const service = readFileSync("src/services/trailingStopWatcher.ts", "utf8");
const route = readFileSync("src/app/api/cron/trailing-stops/route.ts", "utf8");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const rij = (over = {}) => ({
  positionId: "p1",
  symbol: "XAUUSD",
  side: "buy",
  distance: 10,
  lastSetStop: 100,
  ...over,
});

const positie = (over = {}) => ({ positionId: "p1", stopLoss: 100, price: 115, ...over });

console.log("de stop van de broker telt, niet ons eigen briefje");

check("de nieuwe stop wordt gerekend vanaf wat er bij de broker staat", () => {
  // Wij noteerden 100, maar bij de broker staat 90 — onze modify is nooit
  // aangekomen. De nieuwe stop hoort 115 - 10 = 105 te zijn, en de bewaker
  // hoort te melden dat er iets niet klopte.
  const d = decideTrailingSweep(rij({ lastSetStop: 100 }), positie({ stopLoss: 90, price: 115 }));
  assert.equal(d.action, "modify");
  assert.equal(d.stop, 105);
  assert.equal(d.note, "stop_was_verzet_door_iemand_anders");
});

check("een stop die iemand naar achteren haalde wordt gemeld én weer meegetrokken", () => {
  // Meldt het, maar houdt niet op met zijn werk: de positie beschermen gaat
  // voor. Wie hem bewust lager wilde, ziet de melding.
  const d = decideTrailingSweep(rij({ lastSetStop: 108 }), positie({ stopLoss: 95, price: 120 }));
  assert.equal(d.action, "modify");
  assert.equal(d.stop, 110);
  assert.equal(d.note, "stop_was_verzet_door_iemand_anders");
});

check("een stop die iemand juist vóóruit zette is geen melding waard", () => {
  // De trader heeft zelf zijn stop strakker gezet. Dat is geen afwijking om
  // over te klagen, en de bewaker rekent gewoon vanaf die betere stop.
  const d = decideTrailingSweep(rij({ lastSetStop: 100 }), positie({ stopLoss: 108, price: 115 }));
  assert.equal(d.action, "hold", "105 is slechter dan de 108 die er staat");
  assert.equal(d.reason, "prijs_is_niet_ver_genoeg_gelopen");
  assert.equal(d.note, null);
});

check("geen stop bij de broker terwijl wij er een zetten, is een melding", () => {
  const d = decideTrailingSweep(rij({ lastSetStop: 100 }), positie({ stopLoss: null, price: 115 }));
  assert.equal(d.action, "modify");
  assert.equal(d.stop, 105);
  assert.equal(d.note, "broker_had_nog_geen_stop");
});

console.log("");
console.log("niet bewegen als er niets te bewegen valt");

check("een prijs die niet ver genoeg liep laat de stop staan", () => {
  const d = decideTrailingSweep(rij(), positie({ stopLoss: 105, price: 112 }));
  assert.equal(d.action, "hold");
  assert.equal(d.reason, "prijs_is_niet_ver_genoeg_gelopen");
});

check("een verwaarloosbaar verschil is geen broker-aanroep waard", () => {
  // Zonder drempel stuurt de bewaker elke twee minuten een modify die de
  // stop een fractie verzet: honderden aanroepen per dag per positie, en elke
  // aanroep kan geweigerd worden. Dan is de foutenlijst zo vol dat niemand
  // hem nog leest.
  const d = decideTrailingSweep(rij(), positie({ stopLoss: 105, price: 115.0000001 }));
  assert.equal(d.action, "hold");
  assert.equal(d.reason, "stop_staat_al_goed");
});

check("een echt verschil wordt wél verzet", () => {
  const d = decideTrailingSweep(rij(), positie({ stopLoss: 105, price: 115.5 }));
  assert.equal(d.action, "modify");
  assert.equal(d.stop, 105.5);
});

console.log("");
console.log("een positie die niet meer bestaat");

check("wordt vergeten in plaats van eeuwig opnieuw geprobeerd", () => {
  // Anders houdt een gesloten positie voor altijd een rij bezet en levert
  // hij elke twee minuten een foutmelding op.
  const d = decideTrailingSweep(rij(), null);
  assert.equal(d.action, "forget");
  assert.equal(d.reason, "positie_bestaat_niet_meer");
});

console.log("");
console.log("de ondergrens en de short-kant");

check("een afstand onder de ondergrens van de broker beweegt niets", () => {
  const d = decideTrailingSweep(rij({ distance: 0.5 }), positie({ stopLoss: 90, price: 115 }), 2);
  assert.equal(d.action, "hold");
  assert.equal(d.reason, "afstand_te_klein_voor_de_broker");
});

check("bij een short gaat de stop omlaag mee en nooit omhoog", () => {
  const omlaag = decideTrailingSweep(
    rij({ side: "sell", lastSetStop: 120 }),
    positie({ stopLoss: 120, price: 100 }),
  );
  assert.equal(omlaag.action, "modify");
  assert.equal(omlaag.stop, 110);

  const terug = decideTrailingSweep(
    rij({ side: "sell", lastSetStop: 110 }),
    positie({ stopLoss: 110, price: 105 }),
  );
  assert.equal(terug.action, "hold", `de stop ging naar ${terug.stop}`);
});

check("en een short-stop die iemand omhoog haalde wordt ook gemeld", () => {
  // Voor een short is "slechter" hoger, niet lager. Wie dat spiegelt vergeet,
  // meldt precies de verkeerde helft.
  const d = decideTrailingSweep(
    rij({ side: "sell", lastSetStop: 110 }),
    positie({ stopLoss: 125, price: 100 }),
  );
  assert.equal(d.action, "modify");
  assert.equal(d.stop, 110);
  assert.equal(d.note, "stop_was_verzet_door_iemand_anders");
});

console.log("");
console.log("de optelsom die in het cron-antwoord komt");

check("telt verzet, vastgehouden en vergeten apart", () => {
  const samenvatting = summarizeSweep([
    { action: "modify", positionId: "a", stop: 1, note: null },
    { action: "modify", positionId: "b", stop: 2, note: "stop_was_verzet_door_iemand_anders" },
    { action: "hold", positionId: "c", reason: "prijs_is_niet_ver_genoeg_gelopen", note: null },
    { action: "forget", positionId: "d", reason: "positie_bestaat_niet_meer" },
  ]);
  assert.equal(samenvatting.checked, 4);
  assert.equal(samenvatting.moved, 2);
  assert.equal(samenvatting.held, 1);
  assert.equal(samenvatting.forgotten, 1);
  assert.deepEqual(samenvatting.notes, ["stop_was_verzet_door_iemand_anders"]);
});

console.log("");
console.log("en de bewaker eromheen gebruikt het ook echt");

check("de service beslist met decideTrailingSweep en stuurt een modify", () => {
  assert.ok(service.includes("decideTrailingSweep("), "de service neemt de beslissing niet uit de pure laag");
  assert.ok(service.includes("clientModifyPosition("), "er gaat geen modify naar MetaApi");
  assert.ok(/action === "forget"/.test(service), "gesloten posities worden niet opgeruimd");
});

check("de service haalt posities één keer per rekening op, niet per positie", () => {
  // Een trader met acht trailing stops op hetzelfde account hoort geen acht
  // identieke verzoeken te kosten; deze bewaker draait elke paar minuten.
  assert.ok(service.includes("const perAccount = new Map"), "er wordt niet per rekening gegroepeerd");
  const calls = (service.match(/clientGetPositions\(/g) ?? []).length;
  assert.equal(calls, 1, `clientGetPositions staat ${calls} keer in de service`);
});

check("een mislukte modify laat last_set_stop staan", () => {
  // Zou hij hem toch bijwerken, dan rekent de volgende ronde vanaf een stop
  // die nooit gezet is — en dan denkt de trader beschermd te zijn op een
  // niveau dat nergens bestaat.
  const naModify = service.slice(service.indexOf("clientModifyPosition("));
  // Commentaarregels eruit: dit blok légt uit waarom last_set_stop blijft
  // staan, en die uitleg mag de check niet laten afgaan.
  const catchBlok = naModify
    .slice(naModify.indexOf("} catch"), naModify.indexOf("} catch") + 600)
    .split("\n")
    .filter((regel) => !regel.trim().startsWith("//"))
    .join("\n");
  assert.ok(
    !catchBlok.includes("last_set_stop"),
    "last_set_stop wordt bijgewerkt in het catch-blok van een mislukte modify",
  );
});

check("de cron-route zit achter CRON_SECRET", () => {
  assert.ok(route.includes("CRON_SECRET"), "de route is niet beveiligd");
  assert.ok(/Bearer \$\{secret\}/.test(route), "de Authorization-header wordt niet vergeleken");
  assert.ok(route.includes("sweepTrailingStops("), "de route roept de bewaker niet aan");
});

console.log("");
console.log(`${passed} checks passed`);
