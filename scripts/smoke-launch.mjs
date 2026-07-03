#!/usr/bin/env node
/**
 * Production smoke tests for launch foundation.
 *
 * Run from repo root:
 *   cd "/Volumes/Coded USB/AXE-COMPANION-OS-"
 *   npx vercel env pull .env.smoke --environment=production --yes
 *   npm run smoke:launch
 *   rm .env.smoke
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = process.cwd();

if (!existsSync(resolve(REPO_ROOT, "package.json"))) {
  console.error("Run this script from the AXE Companion repo root:");
  console.error('  cd "/Volumes/Coded USB/AXE-COMPANION-OS-"');
  console.error("  npm run smoke:launch");
  process.exit(1);
}

const BASE = process.env.SMOKE_BASE_URL?.trim() || "https://www.axecompanion.com";

function loadEnvFile() {
  for (const name of [".env.smoke", ".env.local"]) {
    const path = resolve(REPO_ROOT, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (v && !process.env[k]) process.env[k] = v;
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

console.log(`Smoke tests → ${BASE}\n`);

await check("Homepage", async () => {
  const res = await fetch(BASE, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
});

await check("Feed page", async () => {
  const res = await fetch(`${BASE}/feed`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
});

await check("Chat page", async () => {
  const res = await fetch(`${BASE}/chat`, { redirect: "follow" });
  if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
});

await check("Onboarding page", async () => {
  const res = await fetch(`${BASE}/onboarding`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
});

await check("Onboarding API (anonymous)", async () => {
  const res = await fetch(`${BASE}/api/onboarding`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return `completed=${j.completed} reason=${j.reason ?? "auth"}`;
});

await check("Feed API (anonymous)", async () => {
  const res = await fetch(`${BASE}/api/feed?limit=3`);
  if (res.status === 401) return "401 (auth required — expected)";
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return `items=${(j.items ?? []).length}`;
});

await check("Chat health (LLM providers)", async () => {
  const res = await fetch(`${BASE}/api/debug/chat-health`);
  const j = await res.json().catch(() => ({}));
  const target = process.env.LLM_TARGET ?? "(server default auto)";
  return `status=${j.status ?? res.status} LLM_TARGET=${target} ollama=${j.ollama?.reachable ?? "?"} openai=${j.openai?.reachable ?? "?"}`;
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
} else {
  console.log("⚠ CRON_SECRET not in .env.smoke — skip authenticated cron tests");
  console.log("  (Vercel CLI sometimes omits decrypted secrets; cron still runs on Vercel)\n");
}

await check("Quotes API (anonymous)", async () => {
  const res = await fetch(`${BASE}/api/quotes/prices`);
  if (res.status === 401) return "401 (auth required)";
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
});

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
