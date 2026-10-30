/**
 * De weekcandle die niemand nameet.
 *
 * Punt 12 van de rij: er is geen W1 en geen MN1, dus top-down kijken — bias op
 * de week, uitvoering op M15 — kan niet. De rij waarschuwt erbij dat een
 * timeframe die leeg blijft erger is dan geen knop, en dat je eerst moet meten
 * of de broker hem teruggeeft.
 *
 * Daarom komen W1 en MN1 hier niet van de broker. Ze worden gevouwen uit de
 * dagcandles die de app al ophaalt, en dan is er niets te meten dat mis kan
 * gaan: werkt D1, dan werkt W1.
 *
 * Wat er wél mis kan gaan is de vouw zelf, en die fouten zijn stuk voor stuk
 * onzichtbaar op een chart. Een slotkoers die de hoogste close pakt in plaats
 * van de laatste tekent een week die altijd sterk sluit. Een weekgrens op UTC
 * maakt van zondagavond een eigen week. Een halve week als voldragen candle
 * laat iemand een omkeerpatroon zien dat vrijdag nog kan verdwijnen. Niets
 * daarvan geeft een foutmelding.
 *
 * Run: node scripts/verify-aggregate-candles.mjs
 */
import assert from "node:assert/strict";

import {
  dailyCandlesNeeded,
  foldIsoCandles,
  foldToMonthly,
  foldToWeekly,
  weekKeyFromDayKey,
} from "../src/lib/chart/aggregateCandles.ts";
import {
  CHART_TF_OPTIONS,
  fetchTimeframeFromKey,
  isFoldedTimeframe,
  normalizeChartTfKey,
} from "../src/lib/broker/chartTimeframes.ts";
import { generateDemoCandles } from "../src/lib/broker/demoAccount.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Broker op EET; dat is de FX-conventie en wat `sessionDay.ts` als default neemt. */
const ZONE = "Europe/Athens";

const at = (iso) => Math.floor(Date.parse(iso) / 1000);

/** Een dagcandle op de MT5-dagopening (EET-middernacht), tenzij anders gezegd. */
const day = (iso, open, high, low, close, volume) => ({
  time: at(iso),
  open,
  high,
  low,
  close,
  ...(volume === undefined ? {} : { volume }),
});

console.log("een week is de eerste open, de laatste close, en de uitersten ertussen");

check("open komt van de eerste dag en close van de laatste", () => {
  // Maandag 5 t/m vrijdag 9 januari 2026.
  const week = foldToWeekly(
    [
      day("2026-01-05T00:00:00+02:00", 100, 104, 99, 103),
      day("2026-01-06T00:00:00+02:00", 103, 108, 102, 107),
      day("2026-01-07T00:00:00+02:00", 107, 110, 101, 102),
      day("2026-01-08T00:00:00+02:00", 102, 105, 100, 104),
      day("2026-01-09T00:00:00+02:00", 104, 106, 96, 97),
    ],
    ZONE,
  );

  assert.equal(week.length, 1, "vijf dagen horen één weekcandle te zijn");
  assert.equal(week[0].open, 100, "open moet van maandag komen");
  // Dit is de check die de voor de hand liggende fout vangt: wie `Math.max`
  // over de closes pakt omdat dat voor de high ook werkte, krijgt hier 107
  // en tekent een week die sterk sluit terwijl hij op de laagste stand sloot.
  assert.equal(week[0].close, 97, `close moet van vrijdag komen, kreeg ${week[0].close}`);
  assert.equal(week[0].high, 110, "high is het hoogste punt van de week");
  assert.equal(week[0].low, 96, "low is het laagste punt van de week");
  assert.equal(week[0].sourceCount, 5);
});

check("high en low komen uit de uitersten, niet uit open en close", () => {
  // Een week die precies op zijn opening sluit maar er flink omheen bewoog.
  // Wie high uit `max(open, close)` haalt ziet hier 50 in plaats van 80.
  const week = foldToWeekly(
    [
      day("2026-01-05T00:00:00+02:00", 50, 80, 20, 60),
      day("2026-01-06T00:00:00+02:00", 60, 70, 10, 50),
    ],
    ZONE,
  );
  assert.equal(week[0].high, 80);
  assert.equal(week[0].low, 10);
});

console.log("");
console.log("de weekgrens is die van de broker, niet die van UTC");

check("zondagavond hoort bij de week die erna komt", () => {
  // FX opent zondag 22:00 UTC. In EET is dat maandag 00:00, dus MT5 zet die
  // candles op maandag. Op een UTC-sleutel is zondag een eigen dag, en
  // daarmee het einde van de vórige week — dan krijgt de trader op maandag
  // een weekcandle te zien die alleen zondagavond bevat.
  const candles = [
    day("2026-01-04T22:00:00Z", 10, 12, 9, 11), // zondagavond UTC = maandag EET
    day("2026-01-05T00:00:00+02:00", 11, 15, 10, 14),
    day("2026-01-06T00:00:00+02:00", 14, 16, 13, 15),
  ];

  const weeks = foldToWeekly(candles, ZONE);
  assert.equal(weeks.length, 1, `zondagavond hoort in dezelfde week, kreeg ${weeks.length} weken`);
  assert.equal(weeks[0].open, 10, "de week opent op de zondagavond-candle");
  assert.equal(weeks[0].sourceCount, 3);
});

check("de maandag-sleutel klopt voor elke dag van de week", () => {
  // 2026-01-05 is een maandag; 01-11 de zondag erna.
  assert.equal(weekKeyFromDayKey("2026-01-05"), "2026-01-05", "maandag is zijn eigen week");
  assert.equal(weekKeyFromDayKey("2026-01-09"), "2026-01-05", "vrijdag hoort bij die maandag");
  // Zondag is de valkuil: `getUTCDay()` geeft 0, en wie daar nul dagen van
  // aftrekt laat elke zondag zijn eigen week beginnen.
  assert.equal(weekKeyFromDayKey("2026-01-11"), "2026-01-05", "zondag hoort bij de maandag ervóór");
  assert.equal(weekKeyFromDayKey("2026-01-12"), "2026-01-12", "de maandag erna is een nieuwe week");
});

check("een onleesbare datum vouwt nergens in mee", () => {
  assert.equal(weekKeyFromDayKey(""), "");
  assert.equal(weekKeyFromDayKey("gisteren"), "");

  const weeks = foldToWeekly(
    [
      day("2026-01-05T00:00:00+02:00", 1, 2, 0.5, 1.5),
      { time: Number.NaN, open: 9, high: 9, low: 9, close: 9 },
    ],
    ZONE,
  );
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].sourceCount, 1, "de kapotte candle mag niet meeliften");
  assert.equal(weeks[0].high, 2, "en mag de high niet verzetten");
});

console.log("");
console.log("de week die nog loopt is niet af");

check("alleen een week met een latere week erachter telt als compleet", () => {
  const weeks = foldToWeekly(
    [
      day("2026-01-05T00:00:00+02:00", 1, 2, 1, 2),
      day("2026-01-09T00:00:00+02:00", 2, 3, 2, 3),
      day("2026-01-12T00:00:00+02:00", 3, 4, 3, 4), // de volgende week, nog bezig
    ],
    ZONE,
  );

  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].complete, true, "de afgesloten week is compleet");
  // Niets in de data bewijst dat deze week gesloten is. Hem als voldragen
  // candle tekenen laat iemand een patroon zien dat vrijdag nog kan omslaan.
  assert.equal(weeks[1].complete, false, "de laatste week is nooit bewijsbaar af");
});

check("één enkele week is dus ook niet compleet", () => {
  const weeks = foldToWeekly([day("2026-01-05T00:00:00+02:00", 1, 2, 1, 2)], ZONE);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].complete, false);
});

console.log("");
console.log("de randgevallen die een chart stilletjes scheeftrekken");

check("ongesorteerde invoer levert dezelfde week op", () => {
  // Candles komen niet altijd op volgorde terug. Ongesorteerd vouwen geeft de
  // verkeerde open en close zonder dat er iets zichtbaar misgaat.
  const gesorteerd = [
    day("2026-01-05T00:00:00+02:00", 100, 105, 99, 101),
    day("2026-01-06T00:00:00+02:00", 101, 107, 100, 106),
    day("2026-01-07T00:00:00+02:00", 106, 109, 95, 96),
  ];
  const doorelkaar = [gesorteerd[2], gesorteerd[0], gesorteerd[1]];

  assert.deepEqual(foldToWeekly(doorelkaar, ZONE), foldToWeekly(gesorteerd, ZONE));
  assert.equal(foldToWeekly(doorelkaar, ZONE)[0].open, 100);
  assert.equal(foldToWeekly(doorelkaar, ZONE)[0].close, 96);
});

check("een feestdagenweek van vier dagen is gewoon één week", () => {
  const weeks = foldToWeekly(
    [
      day("2026-01-06T00:00:00+02:00", 1, 2, 1, 2),
      day("2026-01-07T00:00:00+02:00", 2, 3, 2, 3),
      day("2026-01-08T00:00:00+02:00", 3, 4, 3, 4),
      day("2026-01-09T00:00:00+02:00", 4, 5, 4, 5),
    ],
    ZONE,
  );
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].sourceCount, 4);
});

check("volume telt op, en ontbreekt als geen enkele dag het had", () => {
  const met = foldToWeekly(
    [
      day("2026-01-05T00:00:00+02:00", 1, 2, 1, 2, 100),
      day("2026-01-06T00:00:00+02:00", 2, 3, 2, 3, 250),
    ],
    ZONE,
  );
  assert.equal(met[0].volume, 350);

  const zonder = foldToWeekly([day("2026-01-05T00:00:00+02:00", 1, 2, 1, 2)], ZONE);
  assert.equal("volume" in zonder[0], false, "verzin geen volume van nul");
});

console.log("");
console.log("maanden");

check("een maandgrens knipt op de brokermaand", () => {
  const months = foldToMonthly(
    [
      day("2026-01-29T00:00:00+02:00", 10, 11, 9, 10),
      day("2026-01-30T00:00:00+02:00", 10, 12, 10, 11),
      day("2026-02-02T00:00:00+02:00", 11, 14, 11, 13),
      day("2026-02-03T00:00:00+02:00", 13, 15, 8, 9),
    ],
    ZONE,
  );

  assert.equal(months.length, 2);
  assert.equal(months[0].open, 10);
  assert.equal(months[0].close, 11);
  assert.equal(months[0].complete, true);
  assert.equal(months[1].open, 11);
  assert.equal(months[1].close, 9);
  assert.equal(months[1].low, 8);
  assert.equal(months[1].complete, false);
});

check("de laatste candle van januari valt niet in februari", () => {
  // 31 januari 22:00 UTC is 1 februari 00:00 EET. Op de brokermaand hoort die
  // dus bij februari, net zoals zondagavond bij maandag hoort.
  const months = foldToMonthly(
    [
      day("2026-01-30T00:00:00+02:00", 1, 2, 1, 2),
      day("2026-01-31T22:00:00Z", 2, 3, 2, 3),
    ],
    ZONE,
  );
  assert.equal(months.length, 2, "de laatste candle hoort bij de volgende maand");
});

console.log("");
console.log("genoeg dagen ophalen voor de gevraagde week- of maandcandles");

check("een weekchart vraagt om meer dagen dan candles", () => {
  // 200 weekcandles is vier jaar aan handelsdagen. Vraag je er 200 op, dan
  // komt de chart met acht weken terug en merkt niemand waarom.
  assert.ok(dailyCandlesNeeded("w1", 200) >= 1000, "vijf dagen per week plus marge");
  assert.ok(dailyCandlesNeeded("mn1", 20) >= 440, "22 dagen per maand plus marge");
  assert.equal(dailyCandlesNeeded("d1", 200), 200, "een dagchart vraagt gewoon dagen");
});

check("en nooit meer dan MetaApi in één keer geeft", () => {
  // De REST-grens is 1000 per aanroep; hoger vragen levert stilletjes minder.
  assert.equal(dailyCandlesNeeded("mn1", 500), 1000);
});

console.log("");
console.log("de knop, en wat er voor opgehaald wordt");

check("W1 en MN1 staan als knop op de chart", () => {
  const keys = CHART_TF_OPTIONS.map((o) => o.key);
  assert.ok(keys.includes("w1"), "geen weekknop");
  assert.ok(keys.includes("mn1"), "geen maandknop");
  // De URL-parameter moet ze ook accepteren, anders valt een gedeelde link
  // stilletjes terug op H1.
  assert.equal(normalizeChartTfKey("w1"), "w1");
  assert.equal(normalizeChartTfKey("mn1"), "mn1");
  assert.equal(normalizeChartTfKey("bestaatniet"), "h1");
});

check("voor W1 en MN1 worden dagcandles opgehaald, niet 1w of 1mn", () => {
  // Dit is de hele reden dat ze gevouwen worden: niet elke broker geeft 1w en
  // 1mn terug, en een lege timeframe is erger dan geen knop.
  assert.equal(fetchTimeframeFromKey("w1"), "1d");
  assert.equal(fetchTimeframeFromKey("mn1"), "1d");
  assert.equal(fetchTimeframeFromKey("h4"), "4h", "de rest wordt gewoon opgehaald");
  assert.equal(isFoldedTimeframe("w1"), true);
  assert.equal(isFoldedTimeframe("d1"), false);
});

console.log("");
console.log("de ISO-heen-en-weer naar MetaApi");

check("ISO erin, ISO eruit, en de week klopt nog", () => {
  const weeks = foldIsoCandles(
    [
      { time: "2026-01-05T00:00:00+02:00", open: 100, high: 105, low: 99, close: 101, tickVolume: 10 },
      { time: "2026-01-09T00:00:00+02:00", open: 101, high: 108, low: 95, close: 96, tickVolume: 20 },
    ],
    ZONE,
    "w1",
  );

  assert.equal(weeks.length, 1);
  assert.equal(typeof weeks[0].time, "string", "de tijd moet een ISO-string blijven");
  assert.equal(weeks[0].open, 100);
  assert.equal(weeks[0].close, 96);
  assert.equal(weeks[0].high, 108);
  assert.equal(weeks[0].tickVolume, 30);
});

check("een onleesbare tijd gooit niet alles op één hoop", () => {
  // Zonder de filter wordt `Date.parse` hier NaN, valt elke candle in dezelfde
  // emmer, en krijgt de trader één weekcandle over de hele reeks. Niets gaat
  // fout; de chart is alleen onzin.
  const weeks = foldIsoCandles(
    [
      { time: "2026-01-05T00:00:00+02:00", open: 1, high: 2, low: 1, close: 2 },
      { time: "nergens", open: 50, high: 99, low: 0, close: 50 },
      { time: "2026-01-12T00:00:00+02:00", open: 2, high: 3, low: 2, close: 3 },
    ],
    ZONE,
    "w1",
  );

  assert.equal(weeks.length, 2, `twee weken verwacht, kreeg ${weeks.length}`);
  assert.equal(weeks[0].high, 2, "de kapotte candle mag de high niet verzetten");
});

console.log("");
console.log("ook het oefenaccount tekent weken als weken");

check("demo-candles staan een handelsweek uit elkaar, niet een uur", () => {
  // `timeframeMs` kende w1 en mn1 niet en viel terug op de default van een
  // uur. Het demo-account tekende dan uurcandles met W1 erboven — en dat is
  // precies waar iemand zijn weekbias op zou baseren.
  const week = generateDemoCandles("EURUSD", "w1", 6);
  const stap = Date.parse(week[1].time) - Date.parse(week[0].time);
  assert.equal(stap, 5 * 24 * 60 * 60 * 1000, `stap was ${stap / 3_600_000} uur`);

  const maand = generateDemoCandles("EURUSD", "mn1", 4);
  const maandStap = Date.parse(maand[1].time) - Date.parse(maand[0].time);
  assert.equal(maandStap, 22 * 24 * 60 * 60 * 1000);

  // En de bestaande knoppen zijn niet verschoven.
  const uur = generateDemoCandles("EURUSD", "h1", 3);
  assert.equal(Date.parse(uur[1].time) - Date.parse(uur[0].time), 60 * 60 * 1000);
});

console.log("");
console.log(`${passed} checks passed`);
