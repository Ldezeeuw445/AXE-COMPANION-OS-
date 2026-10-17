import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { PUSH_CATEGORIES } from "./categories";
import {
  buildAccountDeepLink,
  buildChartDeepLink,
  buildChatDeepLink,
  buildPushDeepLink,
  canonicalizePushPath,
  defaultUrlForCategory,
  sanitizePushUrl,
  sessionPatchFromDeepLink,
} from "./deepLinks";
import { createMemoryDedupStore, decideDedup } from "./dedup";
import { buildPushPayload } from "./payload";
import {
  DEFAULT_PUSH_PREFS,
  isWithinQuietHours,
  prefsFromProfileRow,
  sanitizePushPrefs,
  shouldSuppressForPrefs,
} from "./prefs";
import { expiredSubscriptionEndpoints } from "./deliverExpired";
import { applyClickToClient, pickSameOriginClient, resolveNotificationClick } from "./swClickRouting";
import { buildTestPushEvents } from "./testEvents";

const swSource = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

describe("push deep links", () => {
  it("builds a chart link with symbol, timeframe, and account", () => {
    assert.equal(
      buildChartDeepLink(" eurusd ", "15m", "acct-1"),
      "/chart?symbol=EURUSD&tf=m15&account=acct-1",
    );
  });

  it("maps /account to /accounts and rejects off-origin paths", () => {
    assert.equal(canonicalizePushPath("/account"), "/accounts");
    assert.equal(sanitizePushUrl("/account"), "/accounts");
    assert.equal(sanitizePushUrl("https://evil.example/phish"), "/chat");
    assert.equal(sanitizePushUrl("/login"), "/chat");
    assert.equal(buildAccountDeepLink(), "/accounts");
    assert.equal(buildChatDeepLink("thread-9"), "/chat?thread=thread-9");
  });

  it("patches the active session from a deep link", () => {
    const patch = sessionPatchFromDeepLink("/chart?symbol=EURUSD&tf=m15&account=acct-9");
    assert.equal(patch.symbol, "EURUSD");
    assert.equal(patch.timeframe, "m15");
    assert.equal(patch.accountId, "acct-9");
    assert.equal(patch.lastTab, "chart");

    const account = sessionPatchFromDeepLink("/account");
    assert.equal(account.lastTab, "account");
    assert.equal(account.symbol, undefined);

    const chat = sessionPatchFromDeepLink("/chat?thread=abc");
    assert.equal(chat.lastTab, "axe");
  });

  it("picks a default URL per category", () => {
    assert.equal(defaultUrlForCategory("price_alert", { symbol: "XAUUSD", timeframe: "h1" }), "/chart?symbol=XAUUSD&tf=h1");
    assert.equal(defaultUrlForCategory("risk_alert"), "/positions");
    assert.equal(defaultUrlForCategory("broker_disconnect"), "/accounts");
    assert.equal(defaultUrlForCategory("economic_event"), "/feed");
    assert.equal(defaultUrlForCategory("axe_finding", { threadId: "t1" }), "/chat?thread=t1");
    assert.equal(buildPushDeepLink({ category: "axe_finding" }).url, "/journal");
  });
});

describe("push payload", () => {
  it("embeds the deep link and session patch on every category", () => {
    const events = buildTestPushEvents(new Date("2026-10-17T12:00:00.000Z"));
    assert.equal(events.length, PUSH_CATEGORIES.length);
    const price = events.find((e) => e.category === "price_alert");
    assert.ok(price);
    assert.equal(price.payload.url, "/chart?symbol=EURUSD&tf=m15");
    assert.equal(price.payload.data.session.symbol, "EURUSD");
    assert.equal(price.payload.data.session.timeframe, "m15");
    assert.equal(price.payload.data.session.lastTab, "chart");
    assert.equal(price.payload.severity, "alert");

    const disconnect = events.find((e) => e.category === "broker_disconnect");
    assert.ok(disconnect);
    assert.equal(disconnect.payload.url, "/accounts");
    assert.equal(disconnect.payload.severity, "risk");
    assert.equal(disconnect.payload.requireInteraction, true);

    const finding = events.find((e) => e.category === "axe_finding");
    assert.ok(finding);
    assert.equal(finding.payload.url, "/chat?thread=demo-thread");
    assert.equal(finding.payload.data.session.lastTab, "axe");
  });

  it("clips long bodies and tags by event key", () => {
    const payload = buildPushPayload({
      category: "price_alert",
      eventKey: "alert:abc",
      title: "  Alert  ",
      body: "x".repeat(200),
      symbol: "GBPJPY",
    });
    assert.equal(payload.body.endsWith("…"), true);
    assert.ok(payload.body.length <= 180);
    assert.equal(payload.tag, "price_alert:alert:abc");
  });
});

describe("push dedup / rate limit", () => {
  it("allows the first send and blocks the same user+event inside the window", () => {
    const first = decideDedup({ lastSentAt: null, now: 1_000, cooldownMs: 60_000 });
    assert.equal(first.deliver, true);
    const again = decideDedup({ lastSentAt: 1_000, now: 2_000, cooldownMs: 60_000 });
    assert.equal(again.deliver, false);
    if (!again.deliver) {
      assert.equal(again.reason, "rate_limited");
      assert.equal(again.retryAfterMs, 59_000);
    }
  });

  it("re-allows after the cooldown and treats a same-ms claim as a duplicate", () => {
    const later = decideDedup({ lastSentAt: 1_000, now: 61_000, cooldownMs: 60_000 });
    assert.equal(later.deliver, true);
    const sameTick = decideDedup({ lastSentAt: 5_000, now: 5_000, cooldownMs: 60_000 });
    assert.equal(sameTick.deliver, false);
    if (!sameTick.deliver) assert.equal(sameTick.reason, "duplicate");
  });

  it("is scoped per user+event in the memory store", () => {
    const store = createMemoryDedupStore();
    const a = store.claim({ userId: "u1", eventKey: "news:nfp", category: "economic_event", now: 10, cooldownMs: 100 });
    const b = store.claim({ userId: "u1", eventKey: "news:nfp", category: "economic_event", now: 20, cooldownMs: 100 });
    const otherUser = store.claim({ userId: "u2", eventKey: "news:nfp", category: "economic_event", now: 20, cooldownMs: 100 });
    const otherEvent = store.claim({ userId: "u1", eventKey: "news:cpi", category: "economic_event", now: 20, cooldownMs: 100 });
    assert.equal(a.deliver, true);
    assert.equal(b.deliver, false);
    assert.equal(otherUser.deliver, true);
    assert.equal(otherEvent.deliver, true);
  });
});

describe("push prefs + quiet hours", () => {
  it("reads the push slice from profiles.preferences", () => {
    const prefs = prefsFromProfileRow(
      { theme: "dark", push: { categories: { price_alert: false }, quietHours: { enabled: true, start: "21:00", end: "06:30" } } },
      "America/New_York",
    );
    assert.equal(prefs.categories.price_alert, false);
    assert.equal(prefs.categories.risk_alert, true);
    assert.equal(prefs.quietHours.enabled, true);
    assert.equal(prefs.quietHours.start, "21:00");
    assert.equal(prefs.quietHours.timezone, "America/New_York");
  });

  it("treats wrapping quiet hours as overnight", () => {
    const quiet = { enabled: true, start: "22:00", end: "07:00", timezone: "UTC" };
    assert.equal(isWithinQuietHours(new Date("2026-10-17T21:59:00.000Z"), quiet), false);
    assert.equal(isWithinQuietHours(new Date("2026-10-17T22:00:00.000Z"), quiet), true);
    assert.equal(isWithinQuietHours(new Date("2026-10-17T02:00:00.000Z"), quiet), true);
    assert.equal(isWithinQuietHours(new Date("2026-10-17T07:00:00.000Z"), quiet), false);
  });

  it("suppresses disabled categories and quiet hours", () => {
    const prefs = sanitizePushPrefs({
      categories: { economic_event: false },
      quietHours: { enabled: true, start: "00:00", end: "23:59", timezone: "UTC" },
    });
    assert.equal(shouldSuppressForPrefs(prefs, "economic_event", new Date("2026-10-17T12:00:00Z")), "category_disabled");
    assert.equal(shouldSuppressForPrefs({ ...DEFAULT_PUSH_PREFS, quietHours: prefs.quietHours }, "price_alert", new Date("2026-10-17T12:00:00Z")), "quiet_hours");
  });
});

describe("expired subscription cleanup", () => {
  it("collects only 410/404 endpoints and leaves other failures alone", () => {
    const subs = [{ endpoint: "a" }, { endpoint: "b" }, { endpoint: "c" }, { endpoint: "d" }];
    const results: PromiseSettledResult<unknown>[] = [
      { status: "fulfilled", value: undefined },
      { status: "rejected", reason: { statusCode: 410 } },
      { status: "rejected", reason: { statusCode: 500 } },
      { status: "rejected", reason: { statusCode: 404 } },
    ];
    assert.deepEqual(expiredSubscriptionEndpoints(results, subs), ["b", "d"]);
  });
});

describe("SW notificationclick routing", () => {
  it("closes on dismiss and otherwise opens the deep link + session patch", () => {
    assert.deepEqual(resolveNotificationClick({ action: "dismiss", dataUrl: "/chart?symbol=EURUSD" }), { kind: "close" });
    const open = resolveNotificationClick({
      action: "open",
      dataUrl: "/chart?symbol=gbpusd&tf=h4",
    });
    assert.equal(open.kind, "open");
    if (open.kind === "open") {
      assert.equal(open.url, "/chart?symbol=GBPUSD&tf=h4");
      assert.equal(open.session.symbol, "GBPUSD");
      assert.equal(open.session.timeframe, "h4");
      assert.equal(open.session.lastTab, "chart");
      assert.equal(open.message.type, "AXE_PUSH_OPEN");
    }
  });

  it("focuses an existing same-origin client, posts the session, and navigates", () => {
    const calls: string[] = [];
    const other = { url: "https://other.example/chat" };
    const mine = {
      url: "https://www.axecompanion.com/feed",
      focus: () => calls.push("focus"),
      navigate: (url: string) => calls.push(`nav:${url}`),
      postMessage: (data: { type?: string; url?: string }) => calls.push(`msg:${data.type}:${data.url}`),
    };
    const picked = pickSameOriginClient([other, mine], "https://www.axecompanion.com");
    assert.equal(picked, mine);
    const result = resolveNotificationClick({ dataUrl: "/accounts" });
    assert.equal(result.kind, "open");
    if (result.kind === "open") {
      assert.equal(applyClickToClient(mine, result), "focused");
    }
    assert.deepEqual(calls, ["msg:AXE_PUSH_OPEN:/accounts", "nav:/accounts", "focus"]);
  });

  it("keeps public/sw.js wired to the same open/focus/session handshake", () => {
    assert.match(swSource, /addEventListener\(\s*"notificationclick"/);
    assert.match(swSource, /AXE_PUSH_OPEN/);
    assert.match(swSource, /clients\.openWindow/);
    assert.match(swSource, /client\.navigate/);
    assert.match(swSource, /client\.focus/);
    assert.match(swSource, /event\.action === "dismiss"/);
  });
});
