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

/**
 * Hieronder: de pagina loopt van licht naar donker.
 *
 * Dit is waar "minder donker" vandaan kwam, en niet uit het cyaan. Luka's
 * final-landing-v2-enhanced.html begint op #3a3940 en zakt naar #07080a. Een
 * vlakke donkere achtergrond met wat cyaan erop geeft dat nooit.
 */

function helderheid(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  // Ongewogen gemiddelde volstaat: we vergelijken grijstinten met elkaar, niet
  // kleuren met verschillende tinten.
  return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
}

check("de pagina begint licht en eindigt zwart", () => {
  const stops = [...rule(".axe-landing-matte-bg").matchAll(/#([0-9a-f]{6})\s+(\d+)%/gi)];
  assert.ok(stops.length >= 4, `maar ${stops.length} kleurstops — dit is geen verloop`);

  const eerste = helderheid(stops[0][1]);
  const laatste = helderheid(stops[stops.length - 1][1]);
  assert.ok(eerste >= 48, `de bovenkant is ${eerste.toFixed(0)}/255 — te donker om licht te heten`);
  assert.ok(laatste <= 16, `de onderkant is ${laatste.toFixed(0)}/255 — hoort zwart te zijn`);
});

check("en wordt onderweg alleen maar donkerder", () => {
  // Eén stop die lichter is dan de vorige levert een band op die je ziet.
  const stops = [...rule(".axe-landing-matte-bg").matchAll(/#([0-9a-f]{6})\s+(\d+)%/gi)];
  for (let i = 1; i < stops.length; i += 1) {
    const vorige = helderheid(stops[i - 1][1]);
    const deze = helderheid(stops[i][1]);
    assert.ok(deze <= vorige, `stop ${stops[i][2]}% (#${stops[i][1]}) is lichter dan de vorige`);
  }
});

check("de basisplaat is licht, zodat de apparaten erop liggen in plaats van erin", () => {
  const m = rule(".axe-hero-stage").match(/background:\s*#([0-9a-f]{6})/i);
  assert.ok(m, ".axe-hero-stage heeft geen effen achtergrondkleur");
  const h = helderheid(m[1]);
  assert.ok(h >= 55, `de plaat is ${h.toFixed(0)}/255 — dan is het geen plaat maar een gat`);
});

check("de navigatiebalk heeft een gloed die de muis volgt", () => {
  assert.match(rule(".axe-nav-glow::after"), /var\(--nav-x\)/, "de lijn onder de balk staat vast");
  assert.match(rule(".axe-nav-glow::before"), /var\(--nav-x\)/, "de wazige band staat vast");
  const header = readFileSync("src/components/marketing/landing/LandingHeader.tsx", "utf8");
  assert.ok(header.includes("<LandingNavGlow"), "de header gebruikt de gloed niet");
});

check("en knipt het switcher-paneel niet af", () => {
  // Luka's bestand zet `overflow: hidden` op de nav zelf. Het paneel van de
  // AppSwitcher hangt op sm: en groter ónder de header, dus dat zou het
  // volledig wegknippen — de bug die op 12 oktober gerepareerd is. De gloed
  // hoort in een eigen laag te klippen, niet in de header.
  const header = readFileSync("src/components/marketing/landing/LandingHeader.tsx", "utf8");
  const glow = readFileSync("src/components/marketing/landing/LandingNavGlow.tsx", "utf8");
  assert.ok(!/overflow-hidden/.test(header), "de header klipt, en dan is het switcher-paneel weg");
  assert.ok(!/<header[^>]*overflow/.test(glow), "de header klipt via LandingNavGlow");
  assert.match(rule(".axe-nav-glow"), /overflow:\s*hidden/, "de gloedlaag klipt zichzelf niet");
});

check("de gloedbanden volgen de muis en staan op de pagina", () => {
  const band = rule(".axe-glow-band::before");
  assert.ok(band.includes("var(--glow-x)") && band.includes("var(--glow-y)"), "de gloed staat vast");
  // Een standaardwaarde in de CSS, zodat de band ook zonder JS een band is.
  assert.match(rule(".axe-glow-band"), /--glow-x:\s*50%/);
  const page = readFileSync("src/app/page.tsx", "utf8");
  const n = (page.match(/<LandingGlowBand>/g) ?? []).length;
  assert.ok(n >= 4, `${n} gloedbanden op de pagina — final-landing-v2-enhanced heeft er vier`);
});

console.log("");
console.log(`${passed} checks passed`);
