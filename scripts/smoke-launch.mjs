#!/usr/bin/env node
/**
 * Production smoke tests for launch foundation.
 * Usage: node --env-file=.env.local scripts/smoke-launch.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.SMOKE_BASE_URL?.trim() || "https://www.axecompanion.com";

function loadEnvFile() {
  for (const name of [".env.smoke", ".env.local"]) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadEnvFile();

const cronSecret = process.env.CRON_SECRET?.trim();

const checks = [];

async function check(name, fn) {
  try {
    const result = await fn();
    checks.push({ name, ok: true, detail: result });
    console.log(`✓ ${name}: ${result}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    checks.push({ name, ok: false, detail: msg });
    console.log(`✗ ${name}: ${msg}`);
  }
}

await check("Homepage", async () => {
  const res = await fetch(BASE, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
});

await check("Feed page", async () => {
  const res = await fetch(`${BASE}/feed`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (!html.includes("feed") && !html.includes("Feed")) throw new Error("unexpected body");
  return `HTTP ${res.status}`;
});

await check("Onboarding API (anonymous)", async () => {
  const res = await fetch(`${BASE}/api/onboarding`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return `completed=${j.completed} reason=${j.reason ?? "auth"}`;
});

await check("Feed API", async () => {
  const res = await fetch(`${BASE}/api/feed?limit=3`);
  if (res.status === 401) return "401 (auth required — expected)";
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return `items=${(j.items ?? j.feed ?? []).length ?? 0}`;
});

await check("Krater cron unauthorized", async () => {
  const res = await fetch(`${BASE}/api/cron/krater-feed-sync?debug=1`);
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  return "401 as expected";
});

if (cronSecret) {
  await check("Krater cron debug", async () => {
    const res = await fetch(`${BASE}/api/cron/krater-feed-sync?debug=1`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return `mode=${j.syncMode} hasKey=${j.hasKraterApiKey} probeOk=${j.generateProbe?.some((p) => p.ok) ?? false}`;
  });

  await check("Krater force daily_news", async () => {
    const res = await fetch(`${BASE}/api/cron/krater-feed-sync?force=1&types=daily_news`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const synced = (j.results ?? []).find((r) => r.type === "daily_news");
    return synced?.synced ? `synced id=${synced.id}` : JSON.stringify(j).slice(0, 80);
  });
} else {
  console.log("⚠ CRON_SECRET not set locally — skipping authenticated cron smoke tests");
}

await check("Quotes API (anonymous)", async () => {
  const res = await fetch(`${BASE}/api/quotes/prices`);
  if (res.status === 401) return "401 (auth required)";
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
});

await check("Risk band API (anonymous)", async () => {
  const res = await fetch(`${BASE}/api/risk/band`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (res.status === 401) return "401 (auth required)";
  return `HTTP ${res.status}`;
});

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
