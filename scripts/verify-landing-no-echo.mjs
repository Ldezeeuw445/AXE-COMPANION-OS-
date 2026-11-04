/**
 * Geen kop die zichzelf herhaalt, en geen cijfer dat twee keer op de pagina staat.
 *
 * Op 4 november bracht PR #124 een nieuwe landing. Daarin stond
 * "Execution discipline, from your fills." **drie keer**: twee keer binnen
 * LandingDiscipline zelf (een band met de kop, en daaronder dezelfde kop nog
 * eens boven dezelfde body) en één keer in LandingBehaviorMap, waarvan de kop
 * in diezelfde PR woordelijk gelijk was gemaakt aan die van Discipline. De
 * alignment-score 75 stond twee keer, met twee verschillende meters.
 *
 * Niets ging daarvan stuk. Typecheck, 207 tests en de hele verify-keten waren
 * groen, en op de pagina las het als twee metingen en drie beloftes. Dit is
 * het soort fout dat alleen opvalt als je kijkt, en die daarom een check
 * verdient die niet hoeft te kijken.
 *
 * De regel: elke kop die de landing rendert, komt één keer voor. Hetzelfde
 * voor de voorbeeldcijfers waar een bezoeker een meting in leest.
 *
 * Run: node scripts/verify-landing-no-echo.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const MAP = "src/components/marketing/landing";
const EXTRA = ["src/components/marketing/LaunchHeroExperience.tsx"];

const bestanden = [
  ...readdirSync(MAP)
    .filter((n) => n.endsWith(".tsx"))
    .map((n) => `${MAP}/${n}`),
  ...EXTRA,
];

const pagina = readFileSync("src/app/page.tsx", "utf8");

/** Commentaar eruit: een uitleg waarom iets er niet staat is geen koptekst. */
function codeOnly(bron) {
  return bron.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Koppen uit `landingCopy` oplossen naar hun echte tekst.
 *
 * Zonder dit vergelijkt de check `{LANDING_DISCIPLINE.title}` met de
 * letterlijke zin "Execution discipline, from your fills." en ziet twee
 * verschillende koppen — terwijl de bezoeker twee keer hetzelfde leest. Dat
 * was precies de helft van de fout van 4 november die hier onderdoor glipte
 * toen ik deze check voor het eerst draaide.
 */
const copyBron = readFileSync("src/lib/marketing/landingCopy.ts", "utf8");

function losOp(tekst) {
  return tekst.replace(/\{\s*([A-Z_0-9]+)\.([a-zA-Z]+)\s*\}/g, (heel, constante, veld) => {
    const blok = copyBron.match(new RegExp(`export const ${constante} = \\{([\\s\\S]*?)\\n\\} as const;`));
    if (!blok) return heel;
    const waarde = blok[1].match(new RegExp(`\\b${veld}:\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    return waarde ? waarde[1] : heel;
  });
}

/** Welke componenten de pagina echt rendert — de rest telt niet mee. */
const gerenderd = new Set([...pagina.matchAll(/<(Landing[A-Za-z]+|LaunchHeroExperience)[\s/>]/g)].map((m) => m[1]));

let passed = 0;
function check(naam, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${naam}`);
}

console.log("geen echo op de landingspagina");

check("de pagina rendert componenten die ook echt bestaan", () => {
  for (const naam of gerenderd) {
    const pad = naam === "LaunchHeroExperience" ? EXTRA[0] : `${MAP}/${naam}.tsx`;
    assert.ok(bestanden.includes(pad), `${naam} staat op de pagina maar het bestand ontbreekt`);
  }
  assert.ok(gerenderd.size >= 8, `maar ${gerenderd.size} secties — is de pagina stukgelopen?`);
});

check("geen kop staat twee keer op de pagina", () => {
  // Zowel letterlijke koppen als koppen uit landingCopy ({X.title}), want de
  // dubbeling van 4 november liep via allebei.
  const gezien = new Map();
  for (const pad of bestanden) {
    const naam = pad.split("/").pop().replace(".tsx", "");
    if (!gerenderd.has(naam)) continue;
    const bron = codeOnly(readFileSync(pad, "utf8"));
    for (const m of bron.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/g)) {
      const tekst = losOp(m[1].replace(/\s+/g, " ").trim());
      if (!tekst) continue;
      const waar = gezien.get(tekst);
      assert.ok(!waar, `kop "${tekst.slice(0, 60)}" staat in ${waar} én in ${naam}`);
      gezien.set(tekst, naam);
    }
  }
  assert.ok(gezien.size >= 4, `maar ${gezien.size} koppen gevonden — leest deze check nog wel iets?`);
});

check("geen kop herhaalt zich binnen één sectie", () => {
  // Dit was de helft van de fout: LandingDiscipline droeg zijn eigen kop twee
  // keer, één keer in de band en één keer boven dezelfde body.
  for (const pad of bestanden) {
    const naam = pad.split("/").pop().replace(".tsx", "");
    if (!gerenderd.has(naam)) continue;
    const bron = codeOnly(readFileSync(pad, "utf8"));
    const koppen = [...bron.matchAll(/<h[123]\b[^>]*>([\s\S]*?)<\/h[123]>/g)].map((m) =>
      losOp(m[1].replace(/\s+/g, " ").trim()),
    );
    const dubbel = koppen.filter((k, i) => k && koppen.indexOf(k) !== i);
    assert.equal(dubbel.length, 0, `${naam} herhaalt "${dubbel[0]?.slice(0, 60)}"`);
  }
});

check("de alignment-score staat op één plek", () => {
  // Twee meters met hetzelfde getal lezen als twee metingen van verschillende
  // dingen. Eén getal, op de plek waar ook staat waar het uit volgt.
  const plekken = bestanden
    .filter((p) => gerenderd.has(p.split("/").pop().replace(".tsx", "")))
    .filter((p) => /alignment/i.test(codeOnly(readFileSync(p, "utf8"))))
    .filter((p) => /\b75\b/.test(codeOnly(readFileSync(p, "utf8"))));
  assert.equal(
    plekken.length,
    1,
    `de alignment-score staat in ${plekken.length} secties: ${plekken.map((p) => p.split("/").pop()).join(", ")}`,
  );
});

check("elk voorbeeldcijfer draagt nog steeds zijn label", () => {
  const met = bestanden.filter((p) => codeOnly(readFileSync(p, "utf8")).includes("data-landing-cockpit-example"));
  assert.ok(met.length >= 1, "geen enkele sectie noemt zijn cijfers nog een voorbeeld");
  for (const pad of met) {
    const bron = readFileSync(pad, "utf8");
    assert.match(bron, /Example —/, `${pad} heeft de haak maar geen zichtbaar label`);
  }
});

console.log("");
console.log(`${passed} checks passed`);
