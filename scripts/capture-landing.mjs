/**
 * Production-build screenshots so the Next.js dev "N" badge never appears.
 * Run after `npx next build`.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.LANDING_SHOT_PORT ?? 5012);
const baseURL = `http://127.0.0.1:${port}`;
const shotDir = process.env.LANDING_SHOT_DIR ?? join(process.cwd(), "e2e/artifacts");

mkdirSync(shotDir, { recursive: true });

const server = spawn("npx", ["next", "start", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "production" },
});

function waitForReady() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("next start timed out")), 90_000);
    const onData = (buf) => {
      const text = String(buf);
      if (/Ready|started server|Local:/i.test(text)) {
        clearTimeout(timer);
        resolve();
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`next start exited ${code}`));
    });
  });
}

async function waitHttp() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(baseURL, { redirect: "manual" });
      if (res.status) return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error("production server never answered");
}

try {
  await waitForReady().catch(() => {});
  await waitHttp();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  if ((await page.locator("nextjs-portal").count()) > 0) {
    throw new Error("dev badge is visible — this must be a production server");
  }
  await page.screenshot({ path: join(shotDir, "hero-390.png") });
  await page.screenshot({ path: join(shotDir, "landing-390x844.png"), fullPage: true });
  await page.locator("#pricing").screenshot({
    path: join(shotDir, "landing-pricing-390x844.png"),
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(shotDir, "hero-1440.png") });
  await page.screenshot({ path: join(shotDir, "landing-1440x900.png"), fullPage: true });
  await page.locator("#pricing").screenshot({
    path: join(shotDir, "landing-pricing-1440x900.png"),
  });

  const stage = page.locator("[data-hero-stage]");
  await stage.scrollIntoViewIfNeeded();
  await stage.hover();
  await page.waitForTimeout(400);
  await page.locator("[data-landing-hero]").screenshot({
    path: join(shotDir, "hero-hover-1440.png"),
  });

  await browser.close();
  console.log(`wrote screenshots to ${shotDir}`);
} finally {
  server.kill("SIGTERM");
  setTimeout(() => {
    try {
      server.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    process.exit(0);
  }, 1500).unref();
}
