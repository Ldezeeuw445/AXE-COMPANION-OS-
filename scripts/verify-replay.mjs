/**
 * De replay die stiekem de toekomst laat zien.
 *
 * Punt 13 van de rij: bar replay, zodat iemand kan oefenen zonder op de markt
 * te wachten. Het snijden is één regel; alles wat eraan vastzit gaat over
 * vooruitkijken, en dat is een fout die zichzelf nooit meldt. Een replay die
 * ergens de toekomst doorlaat leert het tegenovergestelde van wat hij
 * belooft, en de trader merkt niets — zijn resultaten worden er alleen maar
 * beter van.
 *
 * De zwaarste check hier meet niet of het snijden klopt, maar of de toekomst
 * écht niet lekt: verander een candle die nog moet komen, en er mag geen
 * enkele zichtbare indicatorwaarde veranderen.
 *
 * Run: node scripts/verify-replay.mjs
 */
import assert from "node:assert/strict";

import {
  REPLAY_SUPPRESSES,
  clampReplayIndex,
  earliestReplayIndex,
  fillIndexFor,
  isAtEnd,
  replayPrice,
  startReplay,
  stepBack,
  stepForward,
  visibleCandles,
} from "../src/lib/chart/replay.ts";
import { emaSeries, rsiSeries } from "../src/lib/chart/indicatorMath.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Een reeks met genoeg beweging dat een indicator er iets van maakt. */
function reeks(n) {
  const out = [];
  let close = 100;
  for (let i = 0; i < n; i += 1) {
    close += Math.sin(i / 3) * 1.5 + ((i * 7) % 5) * 0.2 - 0.4;
    out.push({
      time: 1_767_225_600 + i * 3600,
      open: close - 0.3,
      high: close + 0.8,
      low: close - 0.9,
      close,
    });
  }
  return out;
}

console.log("wat de trader ziet, en waar het ophoudt");

check("de zichtbare reeks eindigt op de gekozen candle, inclusief die zelf", () => {
  const candles = reeks(50);
  const state = startReplay(candles.length, 0, 20);
  const zicht = visibleCandles(candles, state);

  // Een snede op `index` in plaats van `index + 1` verbergt juist de bar
  // waar de trader naar kijkt — en dat valt niet op, want de chart ziet er
  // nog steeds normaal uit.
  assert.equal(zicht.length, 21, `verwacht 21 candles, kreeg ${zicht.length}`);
  assert.equal(zicht[zicht.length - 1], candles[20], "de laatste zichtbare moet candle 20 zijn");
});

check("de hele reeks doorgeven is geen replay maar een schuifbalk", () => {
  const candles = reeks(50);
  const state = startReplay(candles.length, 0, 10);
  assert.ok(
    visibleCandles(candles, state).length < candles.length,
    "er wordt niets afgesneden",
  );
});

check("een lege reeks levert niets op in plaats van te klappen", () => {
  const state = startReplay(0, 14);
  assert.deepEqual(visibleCandles([], state), []);
  assert.equal(replayPrice([], state), null);
  assert.equal(fillIndexFor(state), null);
});

console.log("");
console.log("de toekomst lekt niet in de indicatoren");

check("een candle die nog moet komen verandert niets aan wat er staat", () => {
  // Dit is de hele reden dat replay bestaat. Rekent een indicator over de
  // volledige reeks in plaats van over het zichtbare deel, dan zit het
  // antwoord van later al in de lijn van nu — en dan oefent de trader op een
  // chart die hem de uitslag voorzegt.
  const candles = reeks(60);
  const state = startReplay(candles.length, 14, 30);

  const rsiVoor = rsiSeries(visibleCandles(candles, state).map((c) => c.close), 14);
  const emaVoor = emaSeries(visibleCandles(candles, state).map((c) => c.close), 21);

  // Zet een candle ver in de toekomst volledig op zijn kop.
  const verstoord = candles.map((c, i) =>
    i === 45 ? { ...c, open: 9999, high: 10_000, low: 9998, close: 9999 } : c,
  );

  const rsiNa = rsiSeries(visibleCandles(verstoord, state).map((c) => c.close), 14);
  const emaNa = emaSeries(visibleCandles(verstoord, state).map((c) => c.close), 21);

  assert.deepEqual(rsiNa, rsiVoor, "de RSI van het zichtbare deel veranderde door een latere candle");
  assert.deepEqual(emaNa, emaVoor, "de EMA van het zichtbare deel veranderde door een latere candle");
});

check("en een candle die al zichtbaar is verandert er juist wél iets aan", () => {
  // Anders bewijst de vorige check niets: een functie die altijd dezelfde
  // array teruggeeft zou hem ook halen.
  const candles = reeks(60);
  const state = startReplay(candles.length, 14, 30);

  const voor = rsiSeries(visibleCandles(candles, state).map((c) => c.close), 14);
  const verstoord = candles.map((c, i) => (i === 25 ? { ...c, close: 9999 } : c));
  const na = rsiSeries(visibleCandles(verstoord, state).map((c) => c.close), 14);

  assert.notDeepEqual(na, voor, "een zichtbare candle hoort de indicator wél te verzetten");
});

console.log("");
console.log("de opwarmtijd");

check("replay begint niet vóór de indicatoren iets betekenen", () => {
  // Beginnen bij candle 3 met een EMA over 200 tekent ruis die er als een
  // signaal uitziet, en daar valt geen les uit te leren.
  const state = startReplay(500, 200, 3);
  assert.equal(state.index, 200, `begon op ${state.index} in plaats van 200`);
  assert.equal(earliestReplayIndex(200), 200);

  // Terugstappen mag er ook niet onderdoor.
  let terug = state;
  for (let i = 0; i < 10; i += 1) terug = stepBack(terug);
  assert.equal(terug.index, 200, "terugstappen ging onder de opwarmtijd");
});

check("een opwarmtijd langer dan de reeks blokkeert de chart niet", () => {
  // Een verse symbol met 30 candles en een EMA over 200: dan is er geen
  // bruikbaar venster, maar een lege chart teruggeven is erger dan de laatste
  // candle tonen.
  const state = startReplay(30, 200);
  assert.equal(state.index, 29);
  assert.equal(clampReplayIndex(0, 30, 200), 29);
});

console.log("");
console.log("vooruit en terug");

check("stappen loopt niet voorbij het einde of voor het begin", () => {
  const state = startReplay(10, 0, 8);
  const eind = stepForward(stepForward(stepForward(state)));
  assert.equal(eind.index, 9, "voorbij de laatste candle gestapt");
  assert.equal(isAtEnd(eind), true);

  const begin = stepBack(stepBack(stepBack(startReplay(10, 0, 1))));
  assert.equal(begin.index, 0, "voor de eerste candle gestapt");
});

check("halverwege beginnen laat zowel geschiedenis als toekomst over", () => {
  const state = startReplay(101, 0);
  assert.ok(state.index > 0, "er staat niets op de chart om op te beslissen");
  assert.ok(state.index < 100, "er valt niets meer af te spelen");
});

console.log("");
console.log("vullen op een koers die je nog niet kende");

check("een order besloten op bar i vult op zijn vroegst op bar i+1", () => {
  // De laatste zichtbare candle is dicht: zijn slotkoers staat er al. Wie
  // daarop laat vullen handelt op een koers die hij kende — dat is geen
  // oefening maar een garantie, en het maakt elke backtest winstgevend.
  const state = startReplay(100, 0, 40);
  assert.equal(fillIndexFor(state), 41, `vulde op ${fillIndexFor(state)}, dat is de bar die al dicht was`);
});

check("op de laatste bar kan er niet gehandeld worden", () => {
  // Er is geen volgende candle om op te vullen. Weigeren is eerlijker dan
  // terugvallen op de bar die al dicht is.
  const state = startReplay(100, 0, 99);
  assert.equal(fillIndexFor(state), null);
});

console.log("");
console.log("de koers waar de trader naar kijkt");

check("replayPrice is de slotkoers van de laatste zichtbare candle", () => {
  const candles = reeks(40);
  const state = startReplay(candles.length, 0, 15);
  assert.equal(replayPrice(candles, state), candles[15].close);
  // Niet die van de hele reeks: dat zou de prijs van nu zijn, tientallen bars
  // verderop.
  assert.notEqual(replayPrice(candles, state), candles[candles.length - 1].close);
});

check("een onleesbare slotkoers geeft null, niet nul", () => {
  // `Number(null)` is 0 en dat is een geldige prijs voor elke berekening
  // erachter. Eerder in deze codebase vulde dat een order op niets.
  const kapot = [{ close: Number.NaN }];
  assert.equal(replayPrice(kapot, startReplay(1, 0, 0)), null);
});

console.log("");
console.log("wat de chart tijdens replay wegstopt");

check("de lijst noemt de vier dingen die uit het heden komen", () => {
  // Deze lijst is de plek waar het staat. Een chart die er één van laat
  // staan verklapt waar de prijs heen gaat terwijl de trader nog nadenkt.
  for (const naam of ["liveQuote", "liveTicks", "previousDayLevels", "livePositions"]) {
    assert.ok(REPLAY_SUPPRESSES.includes(naam), `${naam} ontbreekt in de lijst`);
  }
});

console.log("");
console.log(`${passed} checks passed`);
