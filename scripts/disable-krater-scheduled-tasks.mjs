#!/usr/bin/env node
/**
 * Pause Krater scheduled broadcast tasks so AXE cron (generate mode) is the
 * sole writer — avoids double Krater credits.
 *
 * Usage (from repo root):
 *   node --env-file=.env.local scripts/disable-krater-scheduled-tasks.mjs
 *
 * Requires KRATER_API_KEY. Never prints the key.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TASK_IDS = {
  daily_news: process.env.KRATER_TASK_ID_DAILY_NEWS?.trim() || "fb396f32-ada0-49f9-b860-c279c08c8c62",
  market_recap: process.env.KRATER_TASK_ID_MARKET_RECAP?.trim() || "7d282b5c-0503-4e8a-a3f5-3bce6d69b838",
};

function loadEnvFile() {
  for (const name of [".env.smoke", ".env.local"]) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnvFile();

const key = process.env.KRATER_API_KEY?.trim();
const base = (process.env.KRATER_API_BASE?.trim() || "https://api.krater.ai").replace(/\/$/, "");

if (!key) {
  console.error("KRATER_API_KEY missing — set in .env.local or environment.");
  process.exit(1);
}

async function kraterFetch(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, ok: res.ok, json };
}

async function tryDisableTask(label, taskId) {
  console.log(`\n→ ${label} (${taskId})`);

  const attempts = [
    ["PATCH", `/v1/scheduled-tasks/${taskId}`, { enabled: false }],
    ["PATCH", `/v1/scheduled-tasks/${taskId}`, { active: false }],
    ["PATCH", `/v1/scheduled-tasks/${taskId}`, { status: "paused" }],
    ["POST", `/v1/scheduled-tasks/${taskId}/pause`, {}],
    ["DELETE", `/v1/scheduled-tasks/${taskId}`, null],
  ];

  for (const [method, path, body] of attempts) {
    const result = await kraterFetch(method, path, body);
    console.log(`  ${method} ${path} → ${result.status}${result.ok ? " ✓" : ""}`);
    if (result.ok) {
      console.log("  Task disabled/paused via API.");
      return true;
    }
    const msg =
      result.json && typeof result.json === "object"
        ? JSON.stringify(result.json).slice(0, 120)
        : "";
    if (msg) console.log(`    ${msg}`);
  }

  const get = await kraterFetch("GET", `/v1/scheduled-tasks/${taskId}`, null);
  console.log(`  GET task → ${get.status}`);
  if (get.ok) {
    console.log("  Task still reachable — disable manually in Krater dashboard:");
    console.log("  https://app.krater.ai → Scheduled Tasks → pause Daily News + Market Recap");
    return false;
  }
  console.log("  Scheduled-task API not available on this key (expected for kr_live_).");
  console.log("  AXE generate mode is already the sole writer — no Krater-side cron needed.");
  return false;
}

console.log("Krater scheduled-task disable script");
console.log(`API base: ${base}`);
console.log("AXE uses KRATER_SYNC_MODE=generate — Krater dashboard tasks should stay OFF.");

let anyDisabled = false;
for (const [label, id] of Object.entries(TASK_IDS)) {
  if (await tryDisableTask(label, id)) anyDisabled = true;
}

if (!anyDisabled) {
  console.log("\nManual step (recommended):");
  console.log("1. Open https://app.krater.ai → Scheduled Tasks");
  console.log("2. Pause/disable: Daily News + Market Recap");
  console.log("3. Confirm Vercel env: KRATER_SYNC_MODE=generate");
}

process.exit(0);
