/**
 * C6 — end-to-end delivery through the /api/push/send core (sendPushToUser).
 * Run: npm test -- push-send-route
 *
 * Drives a watcher alert through the same function the route calls, with a
 * fake device standing in for web-push. No VAPID, no Supabase, no network.
 * Imports the real TS source on purpose — no inline mirror, so this cannot
 * pass if the shipped code is gone.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = await import(
  pathToFileURL(join(__dirname, "../src/lib/push/deliverPushPayload.ts")).href
);
const {
  sendPushToUser,
  buildWatcherAlertPushRequest,
  parsePushSendHttpBody,
  pushSendHttpReachedDevice,
} = src;

const USER = "user-1";
const phone = { endpoint: "https://push.example/phone", p256dh: "p1", auth: "a1" };
const laptop = { endpoint: "https://push.example/laptop", p256dh: "p2", auth: "a2" };

/** In-memory stand-in for push_subscriptions + web-push. */
function fakeDeps({ subs = [], loadError = null, failures = {} } = {}) {
  const delivered = [];
  const deleted = [];
  return {
    delivered,
    deleted,
    deps: {
      loadSubscriptions: async (uid) => {
        assert.equal(uid, USER, "loads subscriptions for the alert's user");
        return { data: loadError ? null : subs, error: loadError };
      },
      sendNotification: async (sub, payload) => {
        const statusCode = failures[sub.endpoint];
        if (statusCode) throw Object.assign(new Error("push failed"), { statusCode });
        delivered.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
      },
      deleteExpired: async (uid, endpoints) => {
        deleted.push({ uid, endpoints });
      },
    },
  };
}

/** What a watcher (axeProactiveWatcher / smartAlertCronEvaluator) concludes from the route. */
function watcherSeesDevice(outcome) {
  return pushSendHttpReachedDevice({
    httpOk: outcome.ok,
    body: parsePushSendHttpBody(JSON.parse(JSON.stringify(outcome))),
  });
}

const alert = buildWatcherAlertPushRequest({
  userId: USER,
  title: "BTC broke 70k",
  body: "Price alert triggered",
  url: "/feed",
});

// 1. Watcher alert reaches a subscribed device, with the payload the SW renders.
{
  const f = fakeDeps({ subs: [phone] });
  const outcome = await sendPushToUser(alert, f.deps);
  assert.deepEqual(outcome, { ok: true, sent: 1, total: 1 });
  assert.equal(f.delivered.length, 1);
  assert.equal(f.delivered[0].endpoint, phone.endpoint);
  assert.equal(f.delivered[0].payload.title, "AXE · BTC broke 70k");
  assert.equal(f.delivered[0].payload.url, "/feed");
  assert.equal(f.delivered[0].payload.tag, "axe-watcher");
  assert.equal(f.deleted.length, 0);
  assert.equal(watcherSeesDevice(outcome), true);
}

// 2. No subscribed device: route answers ok, but the watcher must not count it.
{
  const f = fakeDeps({ subs: [] });
  const outcome = await sendPushToUser(alert, f.deps);
  assert.deepEqual(outcome, { ok: true, sent: 0, total: 0 });
  assert.equal(f.delivered.length, 0);
  assert.equal(watcherSeesDevice(outcome), false);
}

// 3. Every device fails: still HTTP-ok shape, still not delivered.
{
  const f = fakeDeps({ subs: [phone], failures: { [phone.endpoint]: 500 } });
  const outcome = await sendPushToUser(alert, f.deps);
  assert.deepEqual(outcome, { ok: true, sent: 0, total: 1 });
  assert.equal(f.deleted.length, 0, "5xx is transient, endpoint kept");
  assert.equal(watcherSeesDevice(outcome), false);
}

// 4. One device gone (410), one live: delivered, and only the dead one is pruned.
{
  const f = fakeDeps({ subs: [phone, laptop], failures: { [phone.endpoint]: 410 } });
  const outcome = await sendPushToUser(alert, f.deps);
  assert.deepEqual(outcome, { ok: true, sent: 1, total: 2 });
  assert.deepEqual(f.delivered.map((d) => d.endpoint), [laptop.endpoint]);
  assert.deepEqual(f.deleted, [{ uid: USER, endpoints: [phone.endpoint] }]);
  assert.equal(watcherSeesDevice(outcome), true);
}

// 5. 404 is pruned like 410.
{
  const f = fakeDeps({ subs: [laptop], failures: { [laptop.endpoint]: 404 } });
  await sendPushToUser(alert, f.deps);
  assert.deepEqual(f.deleted, [{ uid: USER, endpoints: [laptop.endpoint] }]);
}

// 6. Subscription lookup fails: surfaced as an error, nothing sent.
{
  const f = fakeDeps({ subs: [phone], loadError: "db down" });
  const outcome = await sendPushToUser(alert, f.deps);
  assert.deepEqual(outcome, { ok: false, error: "db down" });
  assert.equal(f.delivered.length, 0);
}

console.log("push-send-route: ok (6 cases)");
