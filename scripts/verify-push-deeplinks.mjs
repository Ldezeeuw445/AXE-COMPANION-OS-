/**
 * PHASE C6 — server-triggered push with deep links.
 *
 * Guards the payload builder, per-category URLs, SW click handshake, and
 * the CRON_SECRET-protected test route so a later edit cannot drop a type
 * or send a notification that opens nowhere.
 *
 * Run: node scripts/verify-push-deeplinks.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PUSH_CATEGORIES } from "../src/lib/push/categories.ts";
import { buildPushDeepLink, sessionPatchFromDeepLink } from "../src/lib/push/deepLinks.ts";
import { decideDedup } from "../src/lib/push/dedup.ts";
import { buildPushPayload } from "../src/lib/push/payload.ts";
import { resolveNotificationClick } from "../src/lib/push/swClickRouting.ts";
import { buildTestPushEvents } from "../src/lib/push/testEvents.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const sw = readFileSync("public/sw.js", "utf8");
const testRoute = readFileSync("src/app/api/push/test/route.ts", "utf8");
const deliver = readFileSync("src/lib/push/deliver.ts", "utf8");
const deliverExpired = readFileSync("src/lib/push/deliverExpired.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261017200000_push_event_deliveries.sql", "utf8");

console.log("push deeplinks");

check("every C6 category has a deep link and a session patch", () => {
  const events = buildTestPushEvents(new Date("2026-10-17T12:00:00Z"));
  assert.equal(events.length, PUSH_CATEGORIES.length);
  for (const event of events) {
    assert.equal(event.payload.url.startsWith("/"), true, event.category);
    assert.ok(event.payload.data.session);
    assert.equal(event.payload.data.url, event.payload.url);
  }
  const price = events.find((e) => e.category === "price_alert");
  assert.equal(price.payload.url, "/chart?symbol=EURUSD&tf=m15");
  assert.equal(price.payload.data.session.symbol, "EURUSD");
  const disconnect = events.find((e) => e.category === "broker_disconnect");
  assert.equal(disconnect.payload.url, "/accounts");
  const finding = events.find((e) => e.category === "axe_finding");
  assert.equal(finding.payload.url, "/chat?thread=demo-thread");
});

check("session patch follows /account → /accounts and chart query params", () => {
  assert.equal(sessionPatchFromDeepLink("/account").lastTab, "account");
  const chart = sessionPatchFromDeepLink("/chart?symbol=xauusd&tf=1h");
  assert.equal(chart.symbol, "XAUUSD");
  assert.equal(chart.timeframe, "h1");
  assert.equal(buildPushDeepLink({ category: "risk_alert" }).url, "/positions");
});

check("payload requireInteraction is on for risk-class events", () => {
  const payload = buildPushPayload({
    category: "risk_alert",
    eventKey: "risk:1",
    title: "Risk",
    body: "Too much USD",
  });
  assert.equal(payload.severity, "risk");
  assert.equal(payload.requireInteraction, true);
});

check("dedup is per user+event and reopens after the window", () => {
  assert.equal(decideDedup({ lastSentAt: null, now: 0, cooldownMs: 1000 }).deliver, true);
  assert.equal(decideDedup({ lastSentAt: 0, now: 500, cooldownMs: 1000 }).deliver, false);
  assert.equal(decideDedup({ lastSentAt: 0, now: 1000, cooldownMs: 1000 }).deliver, true);
});

check("SW click routes to the deep link and posts AXE_PUSH_OPEN", () => {
  const open = resolveNotificationClick({ dataUrl: "/chart?symbol=EURUSD&tf=m15" });
  assert.equal(open.kind, "open");
  assert.equal(open.url, "/chart?symbol=EURUSD&tf=m15");
  assert.equal(open.message.type, "AXE_PUSH_OPEN");
  assert.equal(resolveNotificationClick({ action: "dismiss" }).kind, "close");
  assert.match(sw, /AXE_PUSH_OPEN/);
  assert.match(sw, /notificationclick/);
  assert.match(sw, /client\.navigate/);
  assert.match(sw, /clients\.openWindow/);
});

check("410 cleanup deletes only that subscription row", () => {
  assert.match(deliverExpired, /statusCode === 410/);
  assert.match(deliver, /deleteExpiredSubscriptionRows/);
  assert.match(deliver, /\.eq\("user_id", userId\)/);
  assert.match(deliver, /\.in\("endpoint", endpoints\)/);
});

check("test route is signed-in only and sends each type", () => {
  assert.match(testRoute, /export async function GET/);
  assert.match(testRoute, /export async function POST/);
  assert.match(testRoute, /runPushTestSuite/);
  assert.match(testRoute, /getAuthedServiceSupabase/);
  assert.match(testRoute, /vapidConfigStatus/);
  assert.doesNotMatch(
    testRoute,
    /hasCronSecret/,
    "a trader cannot test push if the route also demands the host cron secret",
  );
});

check("dedup table is owner-only RLS with anon revoked", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /to authenticated/);
  assert.match(migration, /revoke all on table public\.push_event_deliveries from anon/);
  assert.doesNotMatch(migration, /to anon/);
});

console.log(`\n${passed} checks passed`);
