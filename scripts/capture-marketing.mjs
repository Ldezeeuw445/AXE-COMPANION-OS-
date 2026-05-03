/**
 * Captures phone-frame screenshots for the homepage.
 *
 * Prerequisite: production server running, e.g.
 *   npm run build && npm run start
 * Then:
 *   npm run capture:marketing
 *
 * Override URL: MARKETING_URL=https://localhost:3000 npm run capture:marketing
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

const base = process.env.MARKETING_URL ?? "http://127.0.0.1:3000";
const outDir = "public/marketing";
const shots = ["overview", "stats", "chat", "alerts", "vault"];

async function waitForServer(url, tries = 45) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Could not reach ${url}. Start the app: npm run build && npm run start`
  );
}

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

await waitForServer(`${base}/marketing/poster`);

const browser = await chromium.launch();
const page = await browser.newPage({
  deviceScaleFactor: 2,
});
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto(`${base}/marketing/screenshots`, {
  waitUntil: "load",
  timeout: 120_000,
});

for (const id of shots) {
  const loc = page.locator(`[data-marketing-shot="${id}"]`);
  await loc.first().waitFor({ state: "visible", timeout: 30_000 });
  const path = `${outDir}/marketing-${id}.png`;
  await loc.first().screenshot({ path, type: "png" });
  console.log("Wrote", path);
}

await page.setViewportSize({ width: 1440, height: 1900 });
await page.goto(`${base}/marketing/poster`, {
  waitUntil: "load",
  timeout: 120_000,
});
const poster = page.locator('[data-marketing-shot="all"]');
await poster.waitFor({ state: "visible", timeout: 30_000 });
const allPath = `${outDir}/marketing-all.png`;
await poster.screenshot({ path: allPath, type: "png" });
console.log("Wrote", allPath);

await browser.close();
console.log("Done.");
