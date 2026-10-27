/**
 * C6 — last hop of the delivery path: the device's service worker.
 * Run: npm test -- push-service-worker
 *
 * push-send-route proves a watcher alert leaves the server for a subscribed
 * device. This proves what that device does with it: the real public/sw.js is
 * loaded into a sandbox with a fake ServiceWorkerGlobalScope, receives the
 * exact payload bytes sendPushToUser hands to web-push, and must show the
 * notification and deep-link the tap back into the app. No browser, no network.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { sendPushToUser, buildWatcherAlertPushRequest } = await import(
  pathToFileURL(join(__dirname, "../src/lib/push/deliverPushPayload.ts")).href
);
const swSource = await readFile(join(__dirname, "../public/sw.js"), "utf8");

const ORIGIN = "https://app.axe.example";

/** Boot sw.js against a fake ServiceWorkerGlobalScope and record what it does. */
function bootServiceWorker({ windows = [] } = {}) {
  const listeners = {};
  const shown = [];
  const opened = [];
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    skipWaiting: () => {},
    registration: {
      showNotification: async (title, options) => {
        // Round-trip out of the vm realm so deepStrictEqual compares plain data.
        shown.push({ title, options: JSON.parse(JSON.stringify(options)) });
      },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => windows,
      openWindow: async (url) => {
        opened.push(url);
      },
    },
  };
  vm.runInNewContext(swSource, { self, caches: {}, fetch: () => {}, atob, Date });
  return { listeners, shown, opened };
}

/** Dispatch an event the way the browser does and wait for waitUntil work. */
async function dispatch(listener, event) {
  const pending = [];
  listener({ ...event, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
}

/** Push event carrying raw bytes, like PushMessageData. */
function pushEvent(raw) {
  return raw === undefined ? { data: null } : { data: { json: () => JSON.parse(raw) } };
}

/** Run a watcher alert through the server core and capture what the device receives. */
async function deliverToFakeDevice(request) {
  const wire = [];
  const outcome = await sendPushToUser(request, {
    loadSubscriptions: async () => ({
      data: [{ endpoint: "https://push.example/phone", p256dh: "p", auth: "a" }],
      error: null,
    }),
    sendNotification: async (_sub, payload) => {
      wire.push(payload);
    },
    deleteExpired: async () => {},
  });
  assert.deepEqual(outcome, { ok: true, sent: 1, total: 1 });
  assert.equal(wire.length, 1);
  return wire[0];
}

const sw = bootServiceWorker();
for (const type of ["install", "activate", "push", "notificationclick", "pushsubscriptionchange"]) {
  assert.equal(typeof sw.listeners[type], "function", `sw.js registers a ${type} handler`);
}

// 1. Watcher alert: server payload → device shows it with the watcher's title, tag and link.
{
  const raw = await deliverToFakeDevice(
    buildWatcherAlertPushRequest({
      userId: "user-1",
      title: "Stop loss within 0.5%",
      body: "EURUSD is near your SL",
      url: "/positions",
    }),
  );
  const device = bootServiceWorker();
  await dispatch(device.listeners.push, pushEvent(raw));
  assert.equal(device.shown.length, 1, "exactly one notification shown");
  const { title, options } = device.shown[0];
  assert.equal(title, "AXE · Stop loss within 0.5%");
  assert.equal(options.body, "EURUSD is near your SL");
  assert.equal(options.tag, "axe-watcher");
  assert.equal(options.data.url, "/positions");
  assert.equal(options.data.severity, "alert");
  assert.deepEqual(options.vibrate, [220, 110, 220], "alert-class vibration");
  assert.equal(options.requireInteraction, false);
  assert.equal(options.silent, false);
  assert.deepEqual(options.actions, [{ action: "open", title: "Open" }]);
}

// 2. Risk alert: sticky on the lock screen, urgent buzz, Open + Dismiss.
{
  const raw = await deliverToFakeDevice(
    buildWatcherAlertPushRequest({
      userId: "user-1",
      title: "Margin risk",
      body: "Drawdown limit hit",
      url: "/cockpit",
      severity: "risk",
    }),
  );
  const device = bootServiceWorker();
  await dispatch(device.listeners.push, pushEvent(raw));
  const { options } = device.shown[0];
  assert.equal(options.requireInteraction, true);
  assert.deepEqual(options.vibrate, [320, 140, 320, 140, 320]);
  assert.deepEqual(
    options.actions.map((a) => a.action),
    ["open", "dismiss"],
  );
}

// 3. Push without a body (e.g. platform sync ping) still shows something.
{
  const device = bootServiceWorker();
  await dispatch(device.listeners.push, pushEvent(undefined));
  assert.equal(device.shown.length, 1);
  assert.equal(device.shown[0].title, "AXE");
  assert.equal(device.shown[0].options.data.url, "/chat");
}

// 4. Malformed JSON does not swallow the notification.
{
  const device = bootServiceWorker();
  await dispatch(device.listeners.push, pushEvent("not json"));
  assert.equal(device.shown.length, 1);
  assert.equal(device.shown[0].title, "AXE");
}

// 5. Tap with the app open: the existing window navigates to the alert link and is focused.
{
  const calls = [];
  const win = {
    url: `${ORIGIN}/chat`,
    navigate: (u) => calls.push(["navigate", u]),
    focus: async () => calls.push(["focus"]),
  };
  const device = bootServiceWorker({ windows: [win] });
  let closed = false;
  await dispatch(device.listeners.notificationclick, {
    action: "open",
    notification: { data: { url: "/positions" }, close: () => (closed = true) },
  });
  assert.equal(closed, true);
  assert.deepEqual(calls, [["navigate", "/positions"], ["focus"]]);
  assert.deepEqual(device.opened, []);
}

// 6. Tap with the app closed (or only foreign windows): opens a new window at the link.
{
  const foreign = { url: "https://other.example/", navigate: () => {}, focus: async () => {} };
  const device = bootServiceWorker({ windows: [foreign] });
  await dispatch(device.listeners.notificationclick, {
    action: "",
    notification: { data: { url: "/feed" }, close: () => {} },
  });
  assert.deepEqual(device.opened, ["/feed"]);
}

// 7. Dismiss closes without opening the app.
{
  const device = bootServiceWorker();
  let closed = false;
  await dispatch(device.listeners.notificationclick, {
    action: "dismiss",
    notification: { data: { url: "/feed" }, close: () => (closed = true) },
  });
  assert.equal(closed, true);
  assert.deepEqual(device.opened, []);
}

console.log("push-service-worker: ok (7 cases)");
