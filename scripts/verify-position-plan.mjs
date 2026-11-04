/**
 * Het positie-gereedschap, en de limiet die niet meet wat je denkt.
 *
 * Punt 14 van de rij. De R:R uitrekenen kan iedereen; daar zit de waarde
 * niet. Die zit in de regel erna: niet "dit is 1,2% van je account" maar
 * "dit is 30% van wat je vandaag nog mag verliezen, en je hebt al de helft
 * op".
 *
 * En daar zit precies de fout die een gereedschap stil maakt. Een
 * firm-limiet hangt niet aan je huidige equity maar aan een basis — het
 * startkapitaal, de balans bij dagopening, een meelopende piek. Reken je 4%
 * over de equity van nu, dan klopt het alleen op een dag dat er nog niets
 * af is. Sta je in de min, dan rekent die fout de ruimte te klein en houdt
 * de trader zich in terwijl het niet hoeft. Sta je in de plus, dan rekent
 * hij hem te groot en vliegt de trader eruit op een trade die het
 * gereedschap goedkeurde.
 *
 * Run: node scripts/verify-position-plan.mjs
 */
import assert from "node:assert/strict";

import {
  amountForBasis,
  evaluatePositionPlan,
} from "../src/lib/trading/positionPlan.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Eén eenheid prijs is één euro per lot: dan is de rekensom met het blote oog na te lopen. */
const EEN_OP_EEN = 1;

const plan = (over = {}) => ({
  side: "buy",
  entry: 100,
  stop: 90,
  target: 130,
  volumeLots: 1,
  pointValuePerLot: EEN_OP_EEN,
  ...over,
});

const rekening = (over = {}) => ({
  equity: 10_000,
  initialBalance: 10_000,
  dayStartBalance: 10_000,
  ...over,
});

const regels = (over = {}) => ({
  maxDailyLossPct: 4,
  maxDailyLossBasis: "day_start_balance",
  maxTotalLossPct: 10,
  maxTotalLossBasis: "initial_balance",
  ...over,
});

console.log("wat de trade kost, en wat hij kan opleveren");

check("risico, opbrengst en R:R volgen de afstanden", () => {
  const r = evaluatePositionPlan(plan(), rekening(), regels());
  assert.equal(r.ok, true);
  assert.equal(r.riskMoney, 10, "10 punten maal 1 euro maal 1 lot");
  assert.equal(r.rewardMoney, 30);
  assert.equal(r.rr, 3);
  assert.equal(r.riskPctOfEquity, 0.1);
});

check("zonder target is er risico maar geen R:R", () => {
  // Een plan zonder target is een gewoon plan. Er een R:R bij verzinnen —
  // nul, of oneindig — is erger dan hem weglaten.
  const r = evaluatePositionPlan(plan({ target: null }), rekening(), regels());
  assert.equal(r.ok, true);
  assert.equal(r.riskMoney, 10);
  assert.equal(r.rewardMoney, null);
  assert.equal(r.rr, null);
});

console.log("");
console.log("een plan dat geen plan is wordt geweigerd, niet berekend");

check("een long met de stop bóven de entry is geen trade", () => {
  // Hier een R:R bij zetten is hoe een gereedschap onzin aanleert: het getal
  // ziet er normaal uit en de trader leert dat dit een geldige opzet is.
  const r = evaluatePositionPlan(plan({ stop: 110 }), rekening(), regels());
  assert.equal(r.ok, false);
  assert.equal(r.reason, "stop_aan_de_verkeerde_kant");
});

check("en een short met de stop eronder net zo goed", () => {
  const r = evaluatePositionPlan(
    plan({ side: "sell", stop: 90, target: 70 }),
    rekening(),
    regels(),
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, "stop_aan_de_verkeerde_kant");
});

check("een geldige short wordt wél gewoon doorgerekend", () => {
  const r = evaluatePositionPlan(
    plan({ side: "sell", entry: 100, stop: 110, target: 70 }),
    rekening(),
    regels(),
  );
  assert.equal(r.ok, true);
  assert.equal(r.riskMoney, 10);
  assert.equal(r.rewardMoney, 30);
  assert.equal(r.rr, 3);
});

check("een target aan de verkeerde kant ook", () => {
  const r = evaluatePositionPlan(plan({ target: 80 }), rekening(), regels());
  assert.equal(r.ok, false);
  assert.equal(r.reason, "target_aan_de_verkeerde_kant");
});

check("stop op de entry, geen volume en geen rekenwaarde worden apart genoemd", () => {
  assert.equal(evaluatePositionPlan(plan({ stop: 100 }), rekening(), regels()).reason, "stop_op_entry");
  assert.equal(evaluatePositionPlan(plan({ volumeLots: 0 }), rekening(), regels()).reason, "geen_volume");
  assert.equal(
    evaluatePositionPlan(plan({ pointValuePerLot: 0 }), rekening(), regels()).reason,
    "geen_rekenwaarde",
  );
});

console.log("");
console.log("de limiet wordt vanaf de basis gemeten, niet vanaf je equity van nu");

check("een dag waarop al 300 euro weg is, rekent nog steeds over de dagstart", () => {
  // 4% van 10.000 is 400. Er is 300 af, dus er is 100 over.
  //
  // Reken je over de equity van nu — 9.700 — dan kom je op 388 en lijkt er
  // nog 88 over. Dat is 12% te weinig ruimte, en de trader houdt zich in
  // terwijl het niet hoeft.
  const r = evaluatePositionPlan(
    plan(),
    rekening({ equity: 9_700, lostTodayMoney: 300 }),
    regels(),
  );
  assert.equal(r.ok, true);
  assert.equal(r.daily.allowedLoss, 400, `rekende over de verkeerde basis: ${r.daily.allowedLoss}`);
  assert.equal(r.daily.roomLeft, 100);
  assert.equal(r.daily.alreadyLost, 300);
});

check("en op een dag in de plus wordt de ruimte niet groter", () => {
  // Dit is dezelfde fout de andere kant op, en de gevaarlijke: over een
  // equity van 11.000 zou 4% op 440 uitkomen, en dan keurt het gereedschap
  // een trade goed die de trader eruit kan gooien.
  const r = evaluatePositionPlan(plan(), rekening({ equity: 11_000 }), regels());
  assert.equal(r.daily.allowedLoss, 400, `rekende over de equity: ${r.daily.allowedLoss}`);
});

check("elke basis wordt uit zijn eigen bedrag gehaald", () => {
  const bedragen = {
    initialBalance: 10_000,
    dayStartBalance: 9_000,
    dayStartEquity: 8_500,
    trailingEodBalance: 11_000,
    trailingPeakBalance: 12_000,
  };
  assert.equal(amountForBasis("initial_balance", bedragen), 10_000);
  assert.equal(amountForBasis("day_start_balance", bedragen), 9_000);
  assert.equal(amountForBasis("day_start_equity", bedragen), 8_500);
  assert.equal(amountForBasis("trailing_eod_balance", bedragen), 11_000);
  assert.equal(amountForBasis("trailing_peak_balance", bedragen), 12_000);
  assert.equal(amountForBasis(null, bedragen), null);
});

console.log("");
console.log("hoeveel van de ruimte deze trade opeet");

check("het aandeel is van wat er nog over is, niet van de hele limiet", () => {
  // 400 toegestaan, 300 op, 100 over. Een trade die 10 riskeert is 10% van
  // wat er over is — en 2,5% van de limiet. Dat eerste is wat de trader moet
  // weten.
  const r = evaluatePositionPlan(
    plan(),
    rekening({ lostTodayMoney: 300 }),
    regels(),
  );
  assert.equal(r.daily.shareOfRoomPct, 10, `kreeg ${r.daily.shareOfRoomPct}`);
});

check("een trade die de rest opmaakt wordt als zodanig gemeld", () => {
  // 400 toegestaan, 395 op, 5 over, en deze trade riskeert er 10.
  const r = evaluatePositionPlan(
    plan(),
    rekening({ lostTodayMoney: 395 }),
    regels(),
  );
  assert.equal(r.daily.roomLeft, 5);
  assert.equal(r.daily.wouldBreach, true, "deze trade raakt de limiet en dat hoort er te staan");
  assert.equal(r.daily.breached, false, "maar hij is nog niet overschreden");
});

check("al over de limiet geeft geen negatieve ruimte en geen percentage", () => {
  // 420 verloren van de 400 die mocht. "Nog -20 over" is geen budget, en
  // "100% van de ruimte" suggereert dat het nog net past.
  const r = evaluatePositionPlan(plan(), rekening({ lostTodayMoney: 420 }), regels());
  assert.equal(r.daily.breached, true);
  assert.equal(r.daily.roomLeft, 0, "ruimte mag niet negatief worden");
  assert.equal(r.daily.shareOfRoomPct, null);
  assert.equal(r.daily.wouldBreach, true);
});

console.log("");
console.log("onbekend is niet onbeperkt");

check("zonder limiet staat er niet stilzwijgend groen licht", () => {
  const r = evaluatePositionPlan(
    plan(),
    rekening(),
    regels({ maxDailyLossPct: null, maxDailyLossBasis: null }),
  );
  assert.equal(r.daily.unknown, "limit");
  assert.equal(r.daily.roomLeft, null, "null, niet oneindig en niet nul");
  assert.equal(r.daily.wouldBreach, false, "een onbekende limiet mag niet alarmeren");
  assert.equal(r.daily.shareOfRoomPct, null);
});

check("een bekende limiet zonder basisbedrag wordt apart genoemd", () => {
  // Het verschil doet ertoe: "we kennen je limiet niet" is iets anders dan
  // "we kennen hem wel maar weten niet waar hij vanaf gemeten wordt", en de
  // tweede is op te lossen door de trader om zijn dagstart te vragen.
  const r = evaluatePositionPlan(
    plan(),
    { equity: 10_000 },
    regels({ maxDailyLossBasis: "day_start_balance" }),
  );
  assert.equal(r.daily.unknown, "basis");
  assert.equal(r.daily.limitPct, 4, "de limiet zelf is wél bekend");
  assert.equal(r.daily.roomLeft, null);
});

console.log("");
console.log("twee limieten, en de krapste telt");

check("de totale limiet kan krapper zijn dan de dag, ook al is zijn percentage hoger", () => {
  // Dag: 4% van 10.000 = 400, niets af, 400 over.
  // Totaal: 10% van 10.000 = 1.000, maar er staat al 950 onder water: 50 over.
  // Het hogere percentage is hier de krapste band, en dat is precies het
  // geval waarin een trader denkt dat hij ruimte heeft.
  const r = evaluatePositionPlan(
    plan(),
    rekening({ lostTotalMoney: 950 }),
    regels(),
  );
  assert.equal(r.daily.roomLeft, 400);
  assert.equal(r.total.roomLeft, 50);
  assert.equal(r.binding, "total", `wees ${r.binding} aan in plaats van de krapste`);
});

check("zonder totale limiet blijft de dag de bindende", () => {
  const r = evaluatePositionPlan(
    plan(),
    rekening(),
    regels({ maxTotalLossPct: null, maxTotalLossBasis: null }),
  );
  assert.equal(r.binding, "daily");
});

check("zijn beide onbekend, dan wijst niets aan", () => {
  const r = evaluatePositionPlan(
    plan(),
    rekening(),
    regels({ maxDailyLossPct: null, maxDailyLossBasis: null, maxTotalLossPct: null, maxTotalLossBasis: null }),
  );
  assert.equal(r.binding, null);
});

console.log("");
console.log("de lotgrens uit de regels");

check("boven de maximale lotgrootte wordt gemeld, niet stil afgekapt", () => {
  const te_groot = evaluatePositionPlan(plan({ volumeLots: 3 }), rekening(), regels({ maxLot: 2 }));
  assert.equal(te_groot.overMaxLot, true);
  // En het risico wordt gewoon doorgerekend, zodat de trader ziet wát er te
  // groot aan is.
  assert.equal(te_groot.riskMoney, 30);

  const past = evaluatePositionPlan(plan({ volumeLots: 2 }), rekening(), regels({ maxLot: 2 }));
  assert.equal(past.overMaxLot, false, "precies op de grens mag");
});

console.log("");
console.log(`${passed} checks passed`);
