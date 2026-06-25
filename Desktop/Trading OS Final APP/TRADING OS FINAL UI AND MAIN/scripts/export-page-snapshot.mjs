#!/usr/bin/env node
/**
 * Pixel + DOM snapshot of any URL (your running Vite app, localhost, or deployed preview).
 *
 * Figma: import the PNG (File → Place / drag). Use it as a locked reference layer while you
 * rebuild components — Figma does not turn a live SPA into editable vector UI automatically.
 *
 * Usage (dev server must be running for local URLs):
 *   npm run snapshot:page -- --url=http://localhost:5175/app
 *   npm run snapshot:page -- --url=http://localhost:5173/ --wait=4000
 *
 * Hover / glow (extra full-page PNGs after moving the mouse to each selector — CSS :hover applies):
 *   npm run snapshot:page -- --url=http://localhost:5175/app --hover=nav a,.group
 *   (comma-separated; hover the matched element — use the node that actually receives :hover / group-hover)
 *
 * First time only (downloads Chromium):
 *   npx playwright install chromium
 *
 * Outputs under ./design-snapshots/:
 *   <stamp>_<slug>.png              — default state, full-page
 *   <stamp>_<slug>_hover_<n>.png   — one per --hover selector (if hover succeeds)
 *   <stamp>_<slug>.html            — DOM after last step (optional)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function parseArgs() {
  const o = {
    url: 'http://localhost:5173/',
    outDir: path.join(root, 'design-snapshots'),
    waitMs: 2500,
    viewportWidth: 1440,
    viewportHeight: 900,
    hoverSelectors: [],
  };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--url=')) o.url = a.slice(6);
    else if (a.startsWith('--out=')) o.outDir = path.resolve(root, a.slice(6));
    else if (a.startsWith('--wait=')) o.waitMs = Math.max(0, Number(a.slice(7)) || 0);
    else if (a.startsWith('--width=')) o.viewportWidth = Math.max(320, Number(a.slice(8)) || 1440);
    else if (a.startsWith('--height=')) o.viewportHeight = Math.max(200, Number(a.slice(9)) || 900);
    else if (a.startsWith('--hover=')) {
      const parts = a
        .slice(8)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      o.hoverSelectors.push(...parts);
    }
  }
  return o;
}

function slugFromSelector(sel) {
  return sel.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 40) || 'el';
}

function slugFromUrl(u) {
  try {
    const { hostname, pathname } = new URL(u);
    const raw = `${hostname}${pathname}`.replace(/\/+$/, '') || 'page';
    return raw.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 80) || 'page';
  } catch {
    return 'page';
  }
}

async function main() {
  const { url, outDir, waitMs, viewportWidth, viewportHeight, hoverSelectors } = parseArgs();

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const slug = slugFromUrl(url);
  const base = path.join(outDir, `${stamp}_${slug}`);

  const browser = await chromium.launch({ headless: true });
  const written = [];
  try {
    const page = await browser.newPage({
      viewport: { width: viewportWidth, height: viewportHeight },
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    written.push(`${base}.png`);

    let i = 0;
    for (const sel of hoverSelectors) {
      i += 1;
      const outPath = `${base}_hover_${i}_${slugFromSelector(sel)}.png`;
      try {
        const loc = page.locator(sel).first();
        await loc.waitFor({ state: 'visible', timeout: 5000 });
        await loc.scrollIntoViewIfNeeded();
        await loc.hover({ timeout: 3000 });
        await new Promise((r) => setTimeout(r, 400));
        await page.screenshot({ path: outPath, fullPage: true });
        written.push(outPath);
      } catch (e) {
        console.warn(`[snapshot] hover skip "${sel}": ${e instanceof Error ? e.message : e}`);
      }
    }

    const html = await page.content();
    const htmlPath = `${base}.html`;
    fs.writeFileSync(htmlPath, html, 'utf8');
    written.push(htmlPath);
    // eslint-disable-next-line no-console -- CLI script
    console.log(`Wrote:\n${written.map((p) => `  ${p}`).join('\n')}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
