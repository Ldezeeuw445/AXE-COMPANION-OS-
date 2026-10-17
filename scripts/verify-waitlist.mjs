/**
 * The waitlist form has to actually collect something.
 *
 * Found 2026-10-17: `LandingWaitlist` pushed the address into `localStorage`
 * and printed "You're on the list — thank you." There was no table, no
 * endpoint and no email — every address typed into the only form on the
 * landing page was lost, while the privacy policy promised "waitlist
 * communication". These checks keep the three halves wired together: the
 * component posts, the route stores, and nobody says thank you for a request
 * that failed.
 *
 * Run: node scripts/verify-waitlist.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MAX_EMAIL_LENGTH,
  THROTTLE_MAX_PER_WINDOW,
  THROTTLE_WINDOW_MS,
  WAITLIST_SURFACES,
  clientKey,
  parseSignup,
  throttleAllows,
} from "../src/lib/marketing/waitlist.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const form = read("src/components/marketing/LandingWaitlist.tsx");
// The header comment names localStorage on purpose — explaining the bug is
// not committing it — so the "no localStorage" check reads code only.
const formCode = form.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const route = read("src/app/api/waitlist/route.ts");
const migration = read("supabase/migrations/20261017120000_marketing_waitlist.sql");

console.log("waitlist");

// ── the form reaches a server ────────────────────────────────────────────
check("the form posts to /api/waitlist instead of localStorage", () => {
  assert.ok(form.includes('fetch("/api/waitlist"'), "the address has to leave the browser");
  assert.ok(
    !/localStorage/.test(formCode),
    "localStorage is where the addresses used to go to die",
  );
  assert.ok(/method: "POST"/.test(form), "it must be a POST");
});

check("it only says thank you when the server said yes", () => {
  // The whole bug in one line: the old version called setDone(true)
  // unconditionally, so a 500 and a success looked identical to the visitor.
  assert.ok(
    /if \(!res\.ok \|\| !body\.ok\)/.test(form),
    "a failed response must not be reported as a signup",
  );
  const doneAt = form.indexOf('setState("done")');
  const guardAt = form.indexOf("if (!res.ok");
  assert.ok(guardAt > 0 && doneAt > guardAt, "the guard must come before the thank-you");
  assert.ok(/catch \{[\s\S]{0,200}setState\("error"\)/.test(form), "a dropped connection is an error");
});

check("the visitor is told what went wrong, and the form stays usable", () => {
  assert.ok(/role="alert"/.test(form), "the error must be announced");
  assert.ok(/disabled=\{state === "sending"\}/.test(form), "no double submits");
  assert.ok(/"Joining…"/.test(form), "the button must say it is working");
});

// ── the route stores it ──────────────────────────────────────────────────
check("the route writes to marketing_waitlist on the service role", () => {
  assert.ok(route.includes('from("marketing_waitlist")'), "it must write the table");
  assert.ok(
    route.includes("createServiceRoleSupabaseClient"),
    "RLS denies every client, so this write needs the service role",
  );
  assert.ok(
    /if \(!supabase\)[\s\S]{0,400}503/.test(route),
    "an unconfigured server must answer 503, not pretend it stored the address",
  );
});

check("a repeat signup is a success, not an error page", () => {
  assert.ok(
    /error\.code === "23505"[\s\S]{0,80}ok: true/.test(route),
    "signing up twice must read as already on the list",
  );
});

check("the migration denies every browser client", () => {
  assert.ok(/enable row level security/i.test(migration), "RLS must be on");
  assert.ok(
    !/create policy/i.test(migration),
    "no policy means no client can read the addresses — that is the point",
  );
  assert.ok(
    /create unique index[\s\S]{0,120}lower\(email\)/i.test(migration),
    "one row per address, case-insensitively",
  );
});

// ── the parser ───────────────────────────────────────────────────────────
check("an address is normalised before it is stored", () => {
  const r = parseSignup({ email: "  Luka@Example.COM " });
  assert.ok(r.ok);
  assert.equal(r.value.email, "luka@example.com");
  assert.equal(r.value.surface, "companion", "the landing page defaults to its own surface");
  assert.equal(r.value.source, null);
});

check("the surface is an allow-list, never free text from the body", () => {
  assert.equal(parseSignup({ email: "a@b.co", surface: "trading-os" }).value.surface, "trading-os");
  assert.equal(
    parseSignup({ email: "a@b.co", surface: "../../etc/passwd" }).value.surface,
    "companion",
    "an unknown surface falls back rather than being stored",
  );
  assert.deepEqual([...WAITLIST_SURFACES], ["companion", "trading-os"]);
});

check("rubbish is rejected with a reason the visitor can read", () => {
  for (const bad of [
    {},
    { email: "" },
    { email: "   " },
    { email: "nope" },
    { email: "no@domain" },
    { email: "a b@c.com" },
    { email: "@c.com" },
    { email: "a@@c.com" },
    { email: "a@c..com" },
    { email: `${"a".repeat(MAX_EMAIL_LENGTH)}@b.com` },
  ]) {
    const r = parseSignup(bad);
    assert.ok(!r.ok, `${JSON.stringify(bad)} should be rejected`);
    assert.equal(r.status, 400);
    assert.ok(r.error.length > 10 && !/undefined/.test(r.error), "the reason must be readable");
  }
  assert.ok(!parseSignup(null).ok);
  assert.ok(!parseSignup("luka@example.com").ok, "a bare string is not a body");
});

check("addresses that look odd but work are let through", () => {
  // A regex strict enough to feel safe turns real traders away. These are all
  // deliverable addresses.
  for (const good of [
    "luka+axe@example.com",
    "l@example.trading",
    "first.last@sub.domain.co.uk",
    "LUKA@EXAMPLE.COM",
  ]) {
    assert.ok(parseSignup({ email: good }).ok, `${good} should be accepted`);
  }
});

// ── the throttle ─────────────────────────────────────────────────────────
check("a public write has a ceiling", () => {
  const state = new Map();
  const now = 1_700_000_000_000;
  for (let i = 0; i < THROTTLE_MAX_PER_WINDOW; i += 1) {
    assert.ok(throttleAllows(state, "1.2.3.4", now + i), `signup ${i + 1} should pass`);
  }
  assert.ok(!throttleAllows(state, "1.2.3.4", now + 10), "the next one is refused");
  assert.ok(throttleAllows(state, "5.6.7.8", now + 10), "a different client is unaffected");
  assert.ok(
    throttleAllows(state, "1.2.3.4", now + THROTTLE_WINDOW_MS + 1),
    "the window must expire",
  );
  assert.ok(route.includes("429"), "the route must return 429 when it refuses");
});

check("the throttle key is derived from headers and never stored", () => {
  const h = (map) => ({ get: (k) => map[k] ?? null });
  assert.equal(clientKey(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })), "9.9.9.9");
  assert.equal(clientKey(h({ "x-real-ip": "8.8.8.8" })), "8.8.8.8");
  assert.equal(clientKey(h({})), "unknown");
  assert.ok(
    !/ip|user_agent|userAgent/.test(route.split("insert(")[1] ?? ""),
    "only the address, the surface and the source are stored",
  );
});

console.log(`\n${passed} checks passed`);
