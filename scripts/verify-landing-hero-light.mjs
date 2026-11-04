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
const hero = readFileSync("src/components/marketing/LaunchHeroExperience.tsx", "utf8");

/**
 * De body van één CSS-regel.
 *
 * Aan het begin van een regel zoeken en niet zomaar in de tekst: een losse
 * `indexOf(".axe-reveal-back {")` vindt óók de gecombineerde regel
 * `.axe-reveal-front,\n.axe-reveal-back {`, en die staat eerder in het
 * bestand. Dan toetst de check een heel ander blok dan hij bedoelt — en hij
 * faalt op code die klopt, wat erger is dan niet toetsen.
 */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const zoeker = new RegExp(`^${escaped}\\s*\\{`, "gm");

  // Een regelbegin is niet genoeg. In
  //
  //   .axe-reveal-front,
  //   .axe-reveal-back {
  //
  // begint `.axe-reveal-back {` óók op een eigen regel, en die staat eerder
  // in het bestand. Dan leest de check een heel ander blok dan hij bedoelt en
  // faalt hij op code die klopt — erger dan niet toetsen. Een eigen regel
  // herken je eraan dat er géén komma voor staat.
  for (const match of css.matchAll(zoeker)) {
    const ervoor = css.slice(0, match.index).trimEnd();
    if (!ervoor.endsWith(",")) {
      return css.slice(match.index, css.indexOf("}", match.index));
    }
  }

  assert.fail(`${selector} bestaat niet meer als eigen regel in globals.css`);
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
console.log("de reveal-kaarten en de behavior map");

const kaarten = readFileSync("src/components/marketing/landing/LandingRevealCards.tsx", "utf8");
const map = readFileSync("src/components/marketing/landing/LandingBehaviorMap.tsx", "utf8");
const pagina = readFileSync("src/app/page.tsx", "utf8");

check("de drie kaarten spellen A, X en E", () => {
  const letters = [...kaarten.matchAll(/letter:\s*"([A-Z])"/g)].map((m) => m[1]);
  assert.deepEqual(letters, ["A", "X", "E"], `kreeg ${letters.join("")}`);
  assert.ok(pagina.includes("<LandingRevealCards"), "de kaarten staan niet op de pagina");
});

check("de achterkant bepaalt de hoogte, niet een vast getal", () => {
  // Hier ging het mis: met beide kanten absoluut onder een vaste min-height
  // liep de langste tekst er bovenuit — gemeten -8px op 1440, -59px op 1024
  // en -137px op 820. In flexbox telt overloop aan de bovenkant niet mee in
  // scrollHeight, dus niets verraadt het behalve het scherm zelf. Staat de
  // achterkant in de stroom, dan kan het niet meer gebeuren, hoeveel tekst
  // iemand er later ook bij zet.
  const achter = rule(".axe-reveal-back");
  assert.match(achter, /position:\s*relative/, ".axe-reveal-back staat weer absoluut");
  assert.match(rule(".axe-reveal-front"), /position:\s*absolute/, "de voorkant hoort erover te liggen");
});

check("zonder hover is de achterkant alsnog te lezen", () => {
  // Op een telefoon bestaat hover niet. Dan zou de hele inhoud onbereikbaar
  // zijn en staan er drie kaarten met alleen een letter erop.
  // Er staan er meerdere in het bestand (de nav-gloed heeft er ook een), dus
  // het eerste blok pakken levert een check op die het verkeerde leest.
  const blokken = [...css.matchAll(/@media \(hover: none\)\s*\{/g)]
    .map((m) => css.slice(m.index, m.index + 600))
    .filter((b) => b.includes(".axe-reveal-back"));
  assert.equal(blokken.length, 1, `${blokken.length} regels voor schermen zonder hover die de kaarten noemen`);
  assert.match(blokken[0], /\.axe-reveal-back\s*\{[^}]*opacity:\s*1/, "de achterkant blijft verborgen");
});

check("de behavior map noemt zichzelf een voorbeeld", () => {
  // Dezelfde haak als de cockpit, zodat één check beide dekt en een nieuwe
  // sectie met verzonnen cijfers er niet langs glipt.
  assert.ok(map.includes('data-landing-cockpit-example="true"'), "geen voorbeeld-haak");
  assert.match(map, /Example — sample behavior map, not live data/, "het label staat niet op het scherm");
  assert.ok(pagina.includes("<LandingBehaviorMap"), "de map staat niet op de pagina");
});

check("geen mockup die een bron toont die niet betaald is", () => {
  // behavior-phone-left-transparent.png heeft "Market Tide" in zijn eigen
  // screenshot gebakken, en marketTide is een Unusual Whales-bron die nooit
  // gekocht is. verify-landing-claims leest de paginatekst en ziet dat niet:
  // een claim in een PNG glipt erlangs. Rechts staan zes verbeteringen die
  // AXE zichzelf voorstelt en die geen van alle bestaan.
  const bronnen = readFileSync("src/lib/intel/intelSources.ts", "utf8");
  assert.match(bronnen, /marketTide:\s*"unusual_whales"/, "marketTide is van bron veranderd — kijk de mockups opnieuw na");

  // Zonder commentaar, anders valt deze check om over de uitleg waarin de
  // bestandsnamen staan juist omdat ze er niet mogen staan. Een check die
  // faalt op zijn eigen verantwoording leert niemand iets.
  const zonderUitleg = (bron) => bron.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const bestand of ["behavior-phone-left-transparent", "behavior-phone-right-transparent"]) {
    assert.ok(!zonderUitleg(map).includes(bestand), `${bestand} staat weer op de landing`);
    assert.ok(!zonderUitleg(pagina).includes(bestand), `${bestand} staat weer op de landing`);
  }
});

console.log("");
console.log(`${passed} checks passed`);
