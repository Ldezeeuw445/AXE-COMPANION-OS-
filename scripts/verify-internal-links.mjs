/**
 * Geen link in de app die naar een pagina wijst die niet bestaat.
 *
 * Op 5 november stuurden twee plekken de gebruiker naar `/pricing`, en die
 * route bestaat niet — gemeten op productie: 404. Het waren precies de twee
 * momenten waarop iemand wil betalen:
 *
 * - de chat, als je dagelijkse limiet op is: "Upgrade for a higher daily
 *   allowance";
 * - de broker-koppeling, als je je live-accounts hebt volgezet: "View plans".
 *
 * De rest van de app linkt overal naar `/upgrade`, dat wél bestaat. Niets
 * ging hiervan stuk: typecheck, 207 tests en de hele verify-keten waren
 * groen, want een `href` is een string en niemand controleerde hem.
 *
 * Deze check loopt elke interne link na tegen de echte routes onder
 * `src/app`, plus de redirects uit `next.config.ts`. Een link naar een
 * pagina die niet bestaat valt hier om.
 *
 * Run: node scripts/verify-internal-links.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = "src/app";

function loopDoor(map, uit = []) {
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) loopDoor(pad, uit);
    else uit.push(pad);
  }
  return uit;
}

const alleBestanden = loopDoor("src");

/**
 * Welke paden Next.js echt bedient.
 *
 * Een map tussen haakjes is een route-groep en verdwijnt uit de URL — `(app)`
 * in het pad betekent niet dat de URL `/(app)/...` is. Dat eruit laten levert
 * een check op die elke echte link afkeurt en dus meteen uitgezet wordt.
 */
const routes = new Set();
for (const pad of alleBestanden) {
  const m = pad.match(new RegExp(`^${APP}/(.*)/?(page|route)\\.tsx?$`));
  if (!m) continue;
  const url =
    "/" +
    m[1]
      .split("/")
      .filter((deel) => deel && !/^\(.*\)$/.test(deel))
      .join("/");
  routes.add(url === "/" ? "/" : url.replace(/\/$/, ""));
}

// Redirects tellen als bestaande paden: ze geven een 30x, geen 404.
const config = readFileSync("next.config.ts", "utf8");
for (const m of config.matchAll(/source:\s*"([^"]+)"/g)) routes.add(m[1].replace(/\/$/, "") || "/");

/** Een route met [param] erin matcht elk pad van dezelfde vorm. */
const patronen = [...routes]
  .filter((r) => r.includes("["))
  .map((r) => new RegExp("^" + r.replace(/\[\[?\.\.\.[^\]]+\]\]?/g, ".+").replace(/\[[^\]]+\]/g, "[^/]+") + "$"));

function bestaat(pad) {
  if (routes.has(pad)) return true;
  return patronen.some((p) => p.test(pad));
}

let passed = 0;
function check(naam, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${naam}`);
}

console.log("interne links");

check("er zijn routes gevonden om tegen te toetsen", () => {
  // Zonder dit is een lege set een check die altijd slaagt.
  assert.ok(routes.size > 30, `maar ${routes.size} routes gevonden — leest deze check de app wel?`);
  assert.ok(routes.has("/"), "de landing ontbreekt");
  assert.ok(routes.has("/upgrade"), "/upgrade ontbreekt");
});

check("elke interne link wijst naar een pagina die bestaat", () => {
  const stuk = [];
  for (const pad of alleBestanden) {
    if (!/\.tsx?$/.test(pad)) continue;
    const bron = readFileSync(pad, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const m of bron.matchAll(/href=["'](\/[^"'`]*)["']/g)) {
      // Alleen het pad: query en anker bepalen de route niet.
      const doel = m[1].split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
      if (doel.startsWith("/api/")) continue; // geen pagina's
      if (bestaat(doel)) continue;
      stuk.push(`${pad.replace("src/", "")} → ${doel}`);
    }
  }
  assert.deepEqual(stuk, [], `dode links:\n  ${stuk.join("\n  ")}`);
});

check("upgraden gaat overal naar dezelfde plek", () => {
  // Twee plekken wezen naar /pricing en de rest naar /upgrade. Eén
  // bestemming, anders loopt de ene helft van de app een andere kant op als
  // die ooit verhuist.
  const verwijzingen = [];
  for (const pad of alleBestanden) {
    if (!/\.tsx$/.test(pad)) continue;
    const bron = readFileSync(pad, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/href=["']\/pricing/.test(bron)) verwijzingen.push(pad);
  }
  assert.deepEqual(verwijzingen, [], `deze linken naar /pricing, dat niet bestaat: ${verwijzingen.join(", ")}`);
});

console.log("");
console.log(`${passed} checks passed`);
