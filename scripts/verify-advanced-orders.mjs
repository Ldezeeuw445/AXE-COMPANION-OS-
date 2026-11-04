/**
 * De trailing stop die zich laat wegduwen, en de stop-limit die nooit vult.
 *
 * Punt 15 van de rij. Twee ordervormen die de app niet kende, en die allebei
 * falen op een manier die de trader niet ziet.
 *
 * Een trailing stop zet je aan als je weg moet. Dat is precies het moment
 * waarop niemand meekijkt, en dus het moment waarop een fout het langst
 * blijft staan. De enige regel die telt: hij beweegt nooit de verkeerde kant
 * op. Een stop die met een dalende markt mee omlaag schuift is geen trailing
 * stop maar een stop die zich laat wegduwen — en die geeft de bescherming
 * weg op het moment dat hij nodig is.
 *
 * Een stop-limit faalt stiller. MT5 plaatst bij het raken van de stop een
 * gewone limietorder, en een koop-limiet hoort onder de markt. Staat de
 * limiet verkeerd, dan weigert de broker. Staat hij goed maar te ver weg,
 * dan triggert de order, verdwijnt uit het boek, en ligt er niets — terwijl
 * de trader denkt dat hij in de markt zit.
 *
 * Run: node scripts/verify-advanced-orders.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  STOP_LIMIT_GAP_WARN_PCT,
  trailStopOverPrices,
  trailingStopUpdate,
  validateStopLimit,
} from "../src/lib/trading/advancedOrders.ts";

const route = readFileSync("src/app/api/mt5/order/route.ts", "utf8");
const client = readFileSync("src/lib/mt5/metaApiClient.ts", "utf8");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("stop-limit: de limiet hoort aan de goede kant van de stop");

check("een koop triggert boven de markt en legt zijn limiet eronder", () => {
  // Markt 100, stop op 102 (breakout kopen), limiet op 101,8 (vul tot daar).
  const v = validateStopLimit({ side: "buy", stopPrice: 102, limitPrice: 101.8, market: 100 });
  assert.equal(v.ok, true);
  assert.equal(v.gap, 102 - 101.8);
});

check("een koop met de limiet bóven de stop wordt geweigerd", () => {
  // Dit is de fout die MT5 zelf ook weigert: na het triggeren komt er een
  // koop-limiet in het boek boven de markt, en zoiets bestaat niet.
  const v = validateStopLimit({ side: "buy", stopPrice: 102, limitPrice: 102.5, market: 100 });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "limiet_aan_de_verkeerde_kant_van_de_stop");
});

check("en bij een verkoop geldt het omgekeerd", () => {
  const goed = validateStopLimit({ side: "sell", stopPrice: 98, limitPrice: 98.2, market: 100 });
  assert.equal(goed.ok, true);

  const fout = validateStopLimit({ side: "sell", stopPrice: 98, limitPrice: 97.5, market: 100 });
  assert.equal(fout.ok, false);
  assert.equal(fout.reason, "limiet_aan_de_verkeerde_kant_van_de_stop");
});

check("een stop aan de verkeerde kant van de markt is geen stop", () => {
  // Een koop-stop onder de markt gaat meteen af. Dat is een markt-order met
  // extra stappen, en bijna nooit wat iemand bedoelt.
  const v = validateStopLimit({ side: "buy", stopPrice: 99, limitPrice: 98.8, market: 100 });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "stop_aan_de_verkeerde_kant_van_de_markt");

  const s = validateStopLimit({ side: "sell", stopPrice: 101, limitPrice: 101.2, market: 100 });
  assert.equal(s.reason, "stop_aan_de_verkeerde_kant_van_de_markt");
});

check("zonder marktprijs wordt de stopkant niet geraden", () => {
  // Geen markt bekend is geen reden om te weigeren: de limietkant is dan nog
  // steeds te controleren, en dat is de regel die ertoe doet.
  const v = validateStopLimit({ side: "buy", stopPrice: 102, limitPrice: 101.8, market: null });
  assert.equal(v.ok, true);
});

check("limiet gelijk aan de stop wordt apart genoemd", () => {
  // Legaal bij sommige brokers, maar het betekent iets anders dan de trader
  // denkt: er is geen ruimte, dus het is feitelijk een gewone stop-order.
  const v = validateStopLimit({ side: "buy", stopPrice: 102, limitPrice: 102, market: 100 });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "limiet_gelijk_aan_de_stop");
});

check("een groot gat waarschuwt maar weigert niet", () => {
  // De retest kopen is een geldige strategie. Maar hij triggert en wacht dan
  // op een terugval die er niet hoeft te komen, en dat is iets anders dan
  // wat de meeste mensen denken in te stellen.
  const ruim = validateStopLimit({ side: "buy", stopPrice: 100, limitPrice: 98, market: 95 });
  assert.equal(ruim.ok, true);
  assert.equal(ruim.warning, "gat_tussen_stop_en_limiet_is_groot");

  const krap = validateStopLimit({ side: "buy", stopPrice: 100, limitPrice: 99.8, market: 95 });
  assert.equal(krap.warning, null, `0,2% hoort onder de grens van ${STOP_LIMIT_GAP_WARN_PCT}% te vallen`);
});

console.log("");
console.log("trailing stop: nooit de verkeerde kant op");

check("een long trekt zijn stop mee omhoog", () => {
  const v = trailingStopUpdate({ side: "buy", price: 110, currentStop: 95, distance: 10 });
  assert.equal(v.moved, true);
  assert.equal(v.stop, 100);
});

check("en laat hem staan als de prijs terugvalt", () => {
  // Dit is de hele functie. Een stop die hier meebeweegt naar 95 geeft de
  // bescherming weg op het moment dat de markt tegen de positie in loopt.
  const v = trailingStopUpdate({ side: "buy", price: 105, currentStop: 100, distance: 10 });
  assert.equal(v.moved, false);
  assert.equal(v.stop, 100, `de stop zakte naar ${v.stop}`);
  assert.equal(v.reason, "prijs_is_niet_ver_genoeg_gelopen");
});

check("bij een short gaat hij omlaag mee en niet omhoog", () => {
  const omlaag = trailingStopUpdate({ side: "sell", price: 90, currentStop: 105, distance: 10 });
  assert.equal(omlaag.moved, true);
  assert.equal(omlaag.stop, 100);

  const terug = trailingStopUpdate({ side: "sell", price: 95, currentStop: 100, distance: 10 });
  assert.equal(terug.moved, false);
  assert.equal(terug.stop, 100);
});

check("zonder stop is elke stop beter dan geen", () => {
  const v = trailingStopUpdate({ side: "buy", price: 110, currentStop: null, distance: 10 });
  assert.equal(v.moved, true);
  assert.equal(v.stop, 100);
});

check("over een hele reeks gaat de stop nooit terug", () => {
  // Eén aanroep bewijst niets over een fout die pas bij de derde stap
  // omslaat. Deze reeks loopt op, zakt diep terug, en loopt weer op.
  const prijzen = [100, 105, 112, 108, 101, 99, 115, 103];
  const eind = trailStopOverPrices("buy", prijzen, 10);
  assert.equal(eind, 105, `eindigde op ${eind} in plaats van op de top min de afstand`);

  // En een monotone eigenschap: de stop na elke prefix mag nooit dalen.
  let vorige = null;
  for (let i = 1; i <= prijzen.length; i += 1) {
    const stop = trailStopOverPrices("buy", prijzen.slice(0, i), 10);
    if (vorige !== null) assert.ok(stop >= vorige, `stop zakte van ${vorige} naar ${stop} bij stap ${i}`);
    vorige = stop;
  }
});

check("en bij een short stijgt hij nooit", () => {
  const prijzen = [100, 95, 88, 92, 99, 101, 85, 97];
  let vorige = null;
  for (let i = 1; i <= prijzen.length; i += 1) {
    const stop = trailStopOverPrices("sell", prijzen.slice(0, i), 10);
    if (vorige !== null) assert.ok(stop <= vorige, `stop steeg van ${vorige} naar ${stop} bij stap ${i}`);
    vorige = stop;
  }
  assert.equal(trailStopOverPrices("sell", prijzen, 10), 95);
});

console.log("");
console.log("de ondergrens van de broker");

check("een afstand onder de stopsLevel beweegt niets", () => {
  // MT5 weigert een stop die te dicht op de prijs staat. Zou de trailing hem
  // toch versturen, dan loopt hij niet mee terwijl er op het scherm niets
  // verandert — en dat is precies de stilte die een trailing stop gevaarlijk
  // maakt.
  const v = trailingStopUpdate({ side: "buy", price: 110, currentStop: 95, distance: 0.5, minDistance: 2 });
  assert.equal(v.moved, false);
  assert.equal(v.reason, "afstand_te_klein_voor_de_broker");
  assert.equal(v.stop, 95, "de bestaande stop blijft staan");
});

check("precies op de ondergrens mag wel", () => {
  const v = trailingStopUpdate({ side: "buy", price: 110, currentStop: 95, distance: 2, minDistance: 2 });
  assert.equal(v.moved, true);
  assert.equal(v.stop, 108);
});

check("onleesbare invoer beweegt niets en houdt de oude stop", () => {
  for (const kapot of [
    { price: Number.NaN, currentStop: 95, distance: 10 },
    { price: 110, currentStop: 95, distance: 0 },
    { price: 110, currentStop: 95, distance: Number.NaN },
  ]) {
    const v = trailingStopUpdate({ side: "buy", ...kapot });
    assert.equal(v.moved, false, `bewoog op ${JSON.stringify(kapot)}`);
    assert.equal(v.stop, 95, "de bestaande stop mag niet verdwijnen");
  }
});

console.log("");
console.log("en de order-route gebruikt het ook echt");

check("de route kent de twee stop-limit types en mapt ze allebei", () => {
  assert.ok(route.includes('"buy_stop_limit"'), "buy_stop_limit wordt niet geaccepteerd");
  assert.ok(route.includes('"sell_stop_limit"'), "sell_stop_limit wordt niet geaccepteerd");
  assert.ok(route.includes("ORDER_TYPE_BUY_STOP_LIMIT"), "buy wordt niet naar MetaApi gemapt");
  assert.ok(route.includes("ORDER_TYPE_SELL_STOP_LIMIT"), "sell wordt niet naar MetaApi gemapt");
});

check("de route toetst de prijzen in plaats van ze door te geven", () => {
  // Zonder deze toets gaat een koop met de limiet boven de stop gewoon naar
  // de broker. Die weigert hem, en de trader krijgt een algemene brokerfout
  // te zien in plaats van te horen wat er mis is aan zijn opzet.
  assert.ok(route.includes("validateStopLimit("), "de route roept validateStopLimit niet aan");
  assert.ok(
    /if\s*\(!verdict\.ok\)\s*return errJson/.test(route),
    "de uitkomst van de toets wordt niet gebruikt om te weigeren",
  );
});

check("de limietprijs bereikt MetaApi, en alleen bij een stop-limit", () => {
  // Hem altijd meesturen is niet erger dan onnodig, maar hem vergeten
  // betekent een order die triggert zonder limiet erachter.
  assert.ok(/stopLimitPrice: isStopLimit \? stopLimitPrice \?\? null : null/.test(route),
    "stopLimitPrice gaat niet mee in de payload");
  assert.ok(client.includes("body.stopLimitPrice = input.stopLimitPrice"),
    "de MetaApi-client zet stopLimitPrice niet in de body");
});

console.log("");
console.log(`${passed} checks passed`);
