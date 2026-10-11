/**
 * Anonymous accounts must stay impossible.
 *
 * Measured 2026-10-11: 182 of 192 accounts on this project were anonymous, and
 * 175 of them had a broker account attached. No email means no password reset,
 * no second device, and no way for the trader OR for support to reach the data
 * again. For a subscription product that is not a shortcut, it is a trap — and
 * it was the default path on /demo, so it happened to nearly everyone.
 *
 * This guard fails if the app ever calls signInAnonymously again, or if the
 * shared-credentials demo login comes back. That second one mattered just as
 * much: every visitor signed into the SAME user and could read the previous
 * visitor's chats and trades.
 *
 * It cannot police the Supabase project setting — that switch lives in the
 * dashboard, and turning it off there is what makes this airtight. The app
 * fix alone only stops OUR code from asking.
 *
 * Run: node scripts/verify-no-anonymous-auth.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk("src");

console.log("anonymous auth");

check("nothing in the app calls signInAnonymously", () => {
  const offenders = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    // The word may appear in a comment explaining why it is gone. Only a real
    // call counts.
    return /\.auth\s*\.\s*signInAnonymously\s*\(/.test(src);
  });
  assert.deepEqual(
    offenders,
    [],
    `anonymous sign-in is back in:\n  ${offenders.join("\n  ")}`,
  );
});

check("the shared demo login is not restored either", () => {
  const offenders = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return /DEMO_USER_PASSWORD/.test(src) && /signInWithPassword/.test(src);
  });
  assert.deepEqual(
    offenders,
    [],
    `one shared demo user means every visitor reads the last one's data:\n  ${offenders.join("\n  ")}`,
  );
});

check("the demo endpoint refuses and points at a real sign-up", () => {
  const src = readFileSync("src/app/api/auth/demo/route.ts", "utf8");
  assert.ok(/status: 410/.test(src), "an endpoint that is gone should say so");
  assert.ok(/signupUrl/.test(src), "refusing without an alternative is a dead end");
});

check("/demo leads somewhere a visitor can actually get in", () => {
  const src = readFileSync("src/app/demo/page.tsx", "utf8");
  assert.ok(/redirect\(/.test(src));
  assert.ok(/\/login/.test(src));
});

check("the embed explains itself instead of rendering a black box", () => {
  const src = readFileSync("src/app/demo/embed/page.tsx", "utf8");
  // A comment may name the endpoint while explaining why it is gone; only a
  // real fetch counts.
  assert.ok(
    !/fetch\(\s*["'`]\/api\/auth\/demo/.test(src),
    "the embed still asks for a dead session",
  );
  assert.ok(/Sign in to see the live app/.test(src), "an unexplained blank is the same old failure");
});

console.log(`\n${passed} checks passed`);
