/**
 * De hero moet licht zijn, en het dot-grid moet een lichtplek zijn — geen vlak.
 *
 * Op 4 november zei Luka dat de landingspagina te donker was en dat het cyan
 * dot-grid dat "alleen een stukje rondom" oplichtte weg was. Gemeten klopte dat
 * op drie plekken, en alle drie waren stil: niets brak, het zag er alleen
 * slechter uit.
 *
 * 1. `.axe-hero-dots` had zijn `mask-image` verloren. Zonder masker loopt het
 *    raster tot de rand van zijn vierkant en stopt daar hard, dus moest de
 *    dekking zo laag dat je het niet meer zag.
 * 2. Over de kop van de hero lag een donkere sluier (rgba 5,5,8 · 0.18): het
 *    enige deel van het scherm dat licht moest zijn werd gedimd.
 * 3. Het cyaan op de achtergrond stond op 0.03 — een derde van de 0.08 waar
 *    het op tradingosapp.com op stond.
 *
 * Run: node scripts/verify-landing-hero-light.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
const hero = readFileSync("src/components/marketing/landing/LandingHero.tsx", "utf8");

function rule(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} bestaat niet meer in globals.css`);
  return css.slice(start, css.indexOf("}", start));
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("het licht op de hero");

check("het dot-grid achter de plaat lost op naar de rand in plaats van hard te stoppen", () => {
  assert.match(rule(".axe-hero-dots"), /(^|\s)mask-image:\s*radial-gradient/, "geen radiaal masker op .axe-hero-dots");
});

check("en is zichtbaar genoeg om iets te verlichten", () => {
  const m = rule(".axe-hero-dots").match(/opacity:\s*([\d.]+)/);
  assert.ok(m, "geen opacity op .axe-hero-dots");
  assert.ok(Number(m[1]) >= 0.45, `opacity ${m[1]} — onder de 0.45 zie je het raster niet op #060608`);
});

check("de kop heeft een eigen dot-grid-plek, ook met masker", () => {
  assert.ok(hero.includes("axe-hero-headline-dots"), "de hero tekent geen dot-grid achter de kop");
  assert.match(rule(".axe-hero-headline-dots"), /(^|\s)mask-image:/);
});

check("er ligt geen donkere sluier over de hero", () => {
  // Een lineaire gradient in (bijna-)zwart over de hele sectie dimt precies wat
  // licht moet zijn.
  const veil = /linear-gradient\([^)]*rgba\(\s*[0-9]\s*,\s*[0-9]\s*,\s*[0-9]{1,2}\s*,\s*0?\.(1|[2-9])/;
  assert.ok(!veil.test(hero), "LandingHero legt een donkere gradient over zichzelf");
  assert.ok(hero.includes("axe-hero-light"), "de hero heeft geen eigen lichtbron");
});

check("het achtergrondcyaan staat niet lager dan op tradingosapp.com", () => {
  const m = rule(".axe-landing-matte-bg").match(/rgba\(0,\s*212,\s*245,\s*([\d.]+)\)/);
  assert.ok(m, "het cyaan in .axe-landing-matte-bg is niet te vinden");
  assert.ok(Number(m[1]) >= 0.08, `cyaan ${m[1]} — tradingosapp.com staat op 0.08`);
});

console.log("");
console.log(`${passed} checks passed`);
