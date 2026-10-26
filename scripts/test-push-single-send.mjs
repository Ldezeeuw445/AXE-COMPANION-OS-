/**
 * C6 — one alert, one device notification.
 * Run: npm test -- push-single-send
 *
 * recordProactiveFeedEvent() pushes by default. Callers that also POST
 * /api/push/send themselves (to count `pushed` via sent > 0) must pass
 * `{ push: false }`, otherwise each subscribed device gets the alert twice
 * (different tags, so the OS does not collapse them).
 * Static scan over src/ — no network, no secrets, no production data.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcDir = join(root, "src");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Argument text of every `fnName(...)` call, balanced on parentheses. */
function callArgs(source, fnName) {
  const calls = [];
  const needle = `${fnName}(`;
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at === -1) break;
    const prev = source.slice(Math.max(0, at - 9), at);
    from = at + needle.length;
    if (/function\s*$/.test(prev)) continue; // the definition itself
    let depth = 1;
    let i = from;
    while (i < source.length && depth > 0) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") depth -= 1;
      i += 1;
    }
    calls.push(source.slice(from, i - 1));
  }
  return calls;
}

// Sanity-check the scanner itself.
assert.deepEqual(callArgs("f(a, g(b), { push: false });", "f"), ["a, g(b), { push: false }"]);
assert.deepEqual(callArgs("export async function f(x) {}", "f"), []);

const selfPushers = [];
const offenders = [];
for (const file of walk(srcDir)) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("/api/push/send")) continue;
  const calls = callArgs(src, "recordProactiveFeedEvent");
  if (calls.length === 0) continue;
  const rel = relative(root, file);
  selfPushers.push(rel);
  calls.forEach((args, n) => {
    if (!/push\s*:\s*false/.test(args)) offenders.push(`${rel} (call #${n + 1})`);
  });
}

assert.deepEqual(
  offenders,
  [],
  `feed event + own /api/push/send would double-notify; pass { push: false }:\n  ${offenders.join("\n  ")}`,
);

// Guard against the scan silently matching nothing (e.g. after a rename).
for (const expected of [
  "src/services/smartAlertCronEvaluator.ts",
  "src/app/api/alerts/[id]/trigger/route.ts",
]) {
  assert.ok(selfPushers.includes(expected), `expected ${expected} in the scan`);
}

// The feed helper must still honour the opt-out.
const feedSrc = readFileSync(join(srcDir, "lib/feed/recordProactiveFeedEvent.ts"), "utf8");
assert.match(feedSrc, /opts\?\.push\s*!==\s*false/);

console.log(`push-single-send: ok (${selfPushers.length} self-pushing files checked)`);
