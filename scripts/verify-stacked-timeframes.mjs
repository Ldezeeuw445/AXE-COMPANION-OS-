/**
 * Twee charts die hetzelfde zeggen omdat ze hetzelfde kijken.
 *
 * Punt 16 van de rij: dezelfde pair op twee timeframes boven elkaar, zodat
 * de richting en het instapmoment in één blik zitten.
 *
 * De vraag die ertoe doet is welke timeframe erboven hoort. "De volgende in
 * de lijst" is de voor de hand liggende keuze en de verkeerde: boven M15
 * komt dan M30, en dat is dezelfde swing met een halve dag verschil. Het
 * kost schermruimte en levert niets op — maar erger, het ziet eruit als
 * bevestiging. Twee charts die hetzelfde zeggen omdat ze hetzelfde kijken,
 * leest een trader als twee onafhankelijke signalen.
 *
 * Run: node scripts/verify-stacked-timeframes.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EXECUTION_SHARE,
  MIN_BIAS_RATIO,
  MIN_PANE_HEIGHT_PX,
  MIN_STACK_HEIGHT_PX,
  TF_MINUTES,
  BIAS_CANDLE_COUNT,
  EXECUTION_CANDLE_COUNT,
  companionTimeframe,
  isUsablePair,
  stackLayout,
} from "../src/lib/chart/stackedTimeframes.ts";
import { CHART_TF_OPTIONS } from "../src/lib/broker/chartTimeframes.ts";

const route = readFileSync("src/app/api/chart/bias-candles/route.ts", "utf8");
const screen = readFileSync("src/components/chart/ChartScreen.tsx", "utf8");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("welke timeframe hoort erboven");

check("de indeling komt uit op wat traders met de hand maken", () => {
  // Niet verzonnen: dit is de klassieke top-down ladder. Hij volgt hier uit
  // één regel — minstens vier keer zo grof — en niet uit een tabel die
  // iemand heeft ingetikt.
  assert.equal(companionTimeframe("m15"), "h1");
  assert.equal(companionTimeframe("h1"), "h4");
  assert.equal(companionTimeframe("h4"), "d1");
  assert.equal(companionTimeframe("d1"), "w1");
});

check("boven M15 komt niet M30", () => {
  // De fout waar dit bestand voor bestaat. M30 is de volgende in de lijst en
  // laat dezelfde swing zien; H1 is het eerste dat echt een ander plaatje is.
  assert.notEqual(companionTimeframe("m15"), "m30");
  assert.notEqual(companionTimeframe("m30"), "h1", "H1 is maar twee keer zo grof als M30");
  assert.equal(companionTimeframe("m30"), "h4");
});

check("boven de grofste timeframe ligt niets, en dat is geen fout", () => {
  // Dan hoort er één chart te staan, geen tweede die leeg of zinloos is.
  assert.equal(companionTimeframe("mn1"), null);
});

check("een onbekende sleutel levert niets op in plaats van een gok", () => {
  assert.equal(companionTimeframe("bestaatniet"), null);
  assert.equal(companionTimeframe(""), null);
});

check("elke knop op de chart heeft een bias of een eerlijke null", () => {
  // Zodra iemand een timeframe toevoegt aan CHART_TF_OPTIONS moet dit nog
  // kloppen. Een sleutel zonder minuten valt hier om in plaats van stil een
  // lege bovenste chart op te leveren.
  for (const option of CHART_TF_OPTIONS) {
    assert.ok(TF_MINUTES[option.key], `${option.key} staat niet in TF_MINUTES`);
    const bias = companionTimeframe(option.key);
    if (bias !== null) {
      assert.ok(isUsablePair(bias, option.key), `${option.key} → ${bias} haalt de verhouding niet`);
    }
  }
});

check("de verhouding is de regel, niet de volgorde", () => {
  assert.equal(isUsablePair("h4", "h1"), true, "4x hoort te mogen");
  assert.equal(isUsablePair("h1", "m30"), false, "2x is hetzelfde plaatje");
  assert.equal(isUsablePair("m15", "h1"), false, "andersom is geen bias");
  assert.equal(isUsablePair("h1", "h1"), false, "zichzelf is geen tweede chart");
  assert.equal(MIN_BIAS_RATIO, 4);
});

console.log("");
console.log("de hoogte verdelen");

check("de uitvoerings-chart krijgt meer dan de helft", () => {
  // Een gelijke verdeling voelt netjes en werkt slecht: de onderste chart is
  // waar je kijkt en handelt, de bovenste is een blik op de richting.
  const l = stackLayout("m15", 800);
  assert.equal(l.stacked, true);
  assert.ok(l.executionHeight > l.biasHeight, `uitvoering ${l.executionHeight} vs bias ${l.biasHeight}`);
  assert.equal(l.biasHeight + l.executionHeight, 800, "de hoogte moet precies opgaan");
  assert.ok(EXECUTION_SHARE > 0.5 && EXECUTION_SHARE < 0.8);
});

check("onder de drempel staat er één chart in plaats van twee vegen", () => {
  // Te weinig pixels om een candle van een doji te onderscheiden. Dan is één
  // leesbare chart meer waard dan twee onleesbare.
  const l = stackLayout("m15", MIN_STACK_HEIGHT_PX - 1);
  assert.equal(l.stacked, false);
  assert.equal(l.reason, "te_weinig_hoogte");
});

check("precies op de drempel mag, en allebei halen de ondergrens", () => {
  const l = stackLayout("m15", MIN_STACK_HEIGHT_PX);
  assert.equal(l.stacked, true);
  assert.ok(l.biasHeight >= MIN_PANE_HEIGHT_PX, `bias werd ${l.biasHeight}`);
  assert.ok(l.executionHeight >= MIN_PANE_HEIGHT_PX, `uitvoering werd ${l.executionHeight}`);
});

check("op de grofste timeframe wordt niet gestapeld, hoe hoog het scherm ook is", () => {
  const l = stackLayout("mn1", 2000);
  assert.equal(l.stacked, false);
  assert.equal(l.reason, "geen_bias_timeframe");
});

check("een onleesbare hoogte stapelt niet in plaats van NaN te verdelen", () => {
  assert.equal(stackLayout("m15", Number.NaN).stacked, false);
  assert.equal(stackLayout("m15", 0).stacked, false);
});

console.log("");
console.log("zelf een bias kiezen");

check("een eigen keuze mag, zolang hij echt grover is", () => {
  const ruim = stackLayout("m15", 800, "d1");
  assert.equal(ruim.stacked, true);
  assert.equal(ruim.biasKey, "d1", "de trader mag verder weg kijken dan de standaard");
});

check("maar een keuze die niet grover is wordt geweigerd", () => {
  // Anders kan iemand M15 onder M30 zetten en krijgt hij precies de
  // dubbeling waar deze regel tegen bestaat.
  const te_dichtbij = stackLayout("m15", 800, "m30");
  assert.equal(te_dichtbij.stacked, false);
  assert.equal(te_dichtbij.reason, "geen_bias_timeframe");

  const omgekeerd = stackLayout("h4", 800, "m15");
  assert.equal(omgekeerd.stacked, false);
});

console.log("");
console.log("hoeveel candles elke chart ophaalt");

check("de bias-chart haalt er minder op dan de uitvoerings-chart", () => {
  // Even veel ophalen is verspilling aan de ene kant en te weinig aan de
  // andere: boven lees je structuur, onder lees je het moment.
  assert.ok(
    BIAS_CANDLE_COUNT < EXECUTION_CANDLE_COUNT,
    `bias ${BIAS_CANDLE_COUNT}, uitvoering ${EXECUTION_CANDLE_COUNT}`,
  );
  assert.ok(EXECUTION_CANDLE_COUNT <= 1000, "MetaApi geeft er hooguit 1000 per aanroep");
  assert.ok(BIAS_CANDLE_COUNT >= 100, "onder de honderd is er geen structuur te zien");
});

console.log("");
console.log("de route eromheen");

check("de route kiest de bias met de regel, niet met een eigen tabel", () => {
  assert.ok(route.includes("companionTimeframe("), "de route bepaalt de bias zelf");
  assert.ok(route.includes("isUsablePair("), "een zelfgekozen bias wordt niet getoetst");
});

check("eigendom wordt gecontroleerd vóór er iets bij MetaApi wordt gehaald", () => {
  // Anders kan iemand met een geldige sessie de candles van andermans
  // rekening trekken door een ander account-id mee te geven. De volgorde is
  // de hele beveiliging: een check ná de aanroep is geen check.
  const eigendom = route.indexOf("user_broker_accounts");
  const metaapi = route.indexOf("clientGetHistoricalCandles(");
  assert.ok(eigendom > 0, "er wordt geen eigendom gecontroleerd");
  assert.ok(metaapi > 0, "er worden geen candles opgehaald");
  assert.ok(eigendom < metaapi, "de eigendomscheck staat ná de MetaApi-aanroep");
  assert.ok(route.includes('.eq("user_id", user.id)'), "de check filtert niet op de ingelogde gebruiker");
});

check("een fout levert geen stuk chart op maar een leeg paneel", () => {
  // De bias-chart is een blik op de richting. Hem laten struikelen is nooit
  // een reden om de chart waarop gehandeld wordt in de weg te zitten.
  assert.ok(/catch[\s\S]{0,400}status: 200/.test(route), "een fout komt niet als lege 200 terug");
});

check("het scherm hangt het paneel boven de chart en alleen als het past", () => {
  assert.ok(screen.includes("<ChartBiasPane"), "het paneel wordt nergens getekend");
  assert.ok(screen.includes("biasLayout.stacked ?"), "er wordt niet op de indeling gekeken");
  assert.ok(screen.includes("stackLayout("), "de hoogteverdeling komt niet uit de regel");
  const paneel = screen.indexOf("<ChartBiasPane");
  const frame = screen.indexOf("{/* Chart frame");
  assert.ok(paneel < frame, "het paneel staat onder de hoofdchart in plaats van erboven");
});

console.log("");
console.log(`${passed} checks passed`);
