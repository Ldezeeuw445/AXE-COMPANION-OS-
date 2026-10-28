/**
 * C6 — feed-event push is awaited, not fired and forgotten.
 * Run: npm test -- feed-event-push
 *
 * recordProactiveFeedEvent() used to `void` its POST to /api/push/send. On a
 * serverless runtime the handler can return (and the instance freeze) before
 * that fetch leaves, so the alert lands in the feed but never on the device.
 * This drives the real src/lib/feed/feedEventPush.ts with a fake fetch, and
 * statically checks recordProactiveFeedEvent.ts awaits it.
 * No network, no secrets, no production data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const {
  buildFeedPushRequest,
  deliverFeedPush,
  resolveFeedPushBaseUrl,
} = await import(pathToFileURL(join(root, "src/lib/feed/feedEventPush.ts")).href);

/* ── 1. Request shape (what the service worker renders) ───────────── */

const req = buildFeedPushRequest("user-1", "Trade closed: EURUSD", "buy +12.40", "/cockpit", 42);
assert.deepEqual(req, {
  userId: "user-1",
  title: "AXE · Trade closed: EURUSD",
  body: "buy +12.40",
  url: "/cockpit",
  tag: "feed-42",
});

const long = buildFeedPushRequest("u", "t", "x".repeat(400), "/", 1);
assert.equal(long.body.length, 178, "body clipped to 177 chars + ellipsis");
assert.ok(long.body.endsWith("…"));

/* ── 2. Base URL resolution ───────────────────────────────────────── */

assert.equal(resolveFeedPushBaseUrl({ NEXT_PUBLIC_APP_URL: "https://a.test" }), "https://a.test");
assert.equal(resolveFeedPushBaseUrl({ VERCEL_URL: "x.vercel.app" }), "https://x.vercel.app");
assert.equal(resolveFeedPushBaseUrl({}), null);

/* ── 3. Delivery waits for the route ──────────────────────────────── */

{
  const calls = [];
  let settled = false;
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    // Resolve on a later tick: if deliverFeedPush did not await, `settled`
    // would still be false when it returned.
    return new Promise((r) =>
      setTimeout(() => {
        settled = true;
        r({ ok: true });
      }, 20),
    );
  };
  const ok = await deliverFeedPush({
    baseUrl: "https://a.test",
    headers: { "x-internal-push-secret": "s" },
    request: req,
    fetchImpl,
  });
  assert.equal(ok, true);
  assert.equal(settled, true, "deliverFeedPush resolves only after the send finished");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://a.test/api/push/send");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["x-internal-push-secret"], "s");
  assert.deepEqual(JSON.parse(calls[0].init.body), req);
  assert.ok(calls[0].init.signal instanceof AbortSignal, "send is time-bounded");
}

/* ── 4. Best-effort: never throws, never hangs ────────────────────── */

{
  let called = false;
  const ok = await deliverFeedPush({
    baseUrl: null,
    headers: {},
    request: req,
    fetchImpl: async () => {
      called = true;
      return { ok: true };
    },
  });
  assert.equal(ok, false, "no base URL → skipped");
  assert.equal(called, false);
}

assert.equal(
  await deliverFeedPush({
    baseUrl: "https://a.test",
    headers: {},
    request: req,
    fetchImpl: async () => {
      throw new Error("ECONNRESET");
    },
  }),
  false,
  "network error is swallowed",
);

assert.equal(
  await deliverFeedPush({
    baseUrl: "https://a.test",
    headers: {},
    request: req,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  }),
  false,
  "non-2xx reported as not accepted",
);

{
  // AbortSignal.timeout's timer is unref'd; hold the loop open like a server would.
  const keepAlive = setTimeout(() => {}, 5_000);
  const started = Date.now();
  const ok = await deliverFeedPush({
    baseUrl: "https://a.test",
    headers: {},
    request: req,
    timeoutMs: 30,
    fetchImpl: (_url, init) =>
      new Promise((_r, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      }),
  });
  assert.equal(ok, false, "a hung route times out instead of blocking the caller");
  assert.ok(Date.now() - started < 2_000);
  clearTimeout(keepAlive);
}

/* ── 5. recordProactiveFeedEvent awaits the push ──────────────────── */

const record = readFileSync(join(root, "src/lib/feed/recordProactiveFeedEvent.ts"), "utf8");
assert.match(record, /await\s+deliverFeedPush\(/, "push must be awaited");
assert.doesNotMatch(record, /void\s+deliverFeedPush\(/, "no fire-and-forget push");
assert.doesNotMatch(record, /\bfetch\(/, "all sending goes through deliverFeedPush");

console.log("feed-event-push: all assertions passed");
