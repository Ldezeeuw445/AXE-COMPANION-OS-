/**
 * Guard test — the real TypeScript sources must be importable from Node.
 * Run: npm run test:ts-source-loadable
 *
 * Why this exists:
 * `test-push-delivery`, `test-uw-gate`, `test-intel-provider-envelope` and
 * `test-finra-short-volume` import their helpers from `src/**.ts` and fall back
 * to an inline mirror of that logic when the import fails. That fallback keeps
 * the suite zero-dep, but it also means those tests can pass against their own
 * copy while the shipped source is broken or deleted — a vacuous pass.
 *
 * This test makes that failure mode loud: if Node cannot load the real modules
 * (type stripping unavailable, file moved, export renamed), it fails here and
 * tells you the other four tests were only checking their mirrors.
 *
 * Requires Node >= 22.18 (type stripping on by default) or `--experimental-strip-types`.
 * `scripts/run-tests.mjs` is the supported entry point and handles both.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Each entry mirrors one test that would otherwise silently use its inline copy. */
const TARGETS = [
  {
    mirroredBy: "test-push-delivery",
    path: "src/lib/push/deliverPushPayload.ts",
    exports: [
      "buildPushNotificationPayload",
      "summarizePushDelivery",
      "watcherAlertReachedDevice",
      "parsePushSendHttpBody",
      "pushSendHttpReachedDevice",
      "buildWatcherAlertPushRequest",
      "evaluateWatcherAlertDelivery",
      "sendPushToUser",
    ],
  },
  {
    mirroredBy: "test-uw-gate",
    path: "src/lib/intel/freeSources/uwGate.ts",
    exports: [
      "isUnusualWhalesEnabled",
      "resolveUnusualWhalesToken",
      "unusualWhalesHeaders",
    ],
  },
  {
    mirroredBy: "test-intel-provider-envelope",
    path: "src/lib/intel/freeSources/providerFromEnvelope.ts",
    exports: [
      "formatIntelUnavailable",
      "reasonFromIntelEnvelope",
      "intelProviderShowsLive",
    ],
  },
  {
    mirroredBy: "test-finra-short-volume",
    path: "src/lib/intel/freeSources/finraShortVolume.ts",
    exports: [
      "finraCandidateDates",
      "finraShortVolumeUrl",
      "parseFinraShortVolumeText",
    ],
  },
];

const loaded = [];

for (const target of TARGETS) {
  const href = pathToFileURL(join(root, target.path)).href;
  let mod;
  try {
    mod = await import(href);
  } catch (err) {
    assert.fail(
      `Cannot import ${target.path} from Node (${err?.message ?? err}).\n` +
        `  → ${target.mirroredBy} is therefore testing its inline mirror, not the shipped source.\n` +
        `  → Run the suite via "npm test" (scripts/run-tests.mjs), or use Node >= 22.18.`,
    );
  }

  for (const name of target.exports) {
    assert.equal(
      typeof mod[name],
      "function",
      `${target.path} must export ${name}() — ${target.mirroredBy} mirrors it, ` +
        `so a rename here would leave that test passing against a stale copy.`,
    );
  }
  loaded.push(target.path);
}

// Smoke the real implementations so a hollow module (correct exports, no behaviour)
// still fails here rather than being papered over by a mirror.
const { buildWatcherAlertPushRequest } = await import(
  pathToFileURL(join(root, "src/lib/push/deliverPushPayload.ts")).href
);
assert.equal(
  buildWatcherAlertPushRequest({
    userId: "u1",
    title: "Trade closed",
    body: "x",
    url: "/cockpit",
  }).title,
  "AXE · Trade closed",
);

const { isUnusualWhalesEnabled } = await import(
  pathToFileURL(join(root, "src/lib/intel/freeSources/uwGate.ts")).href
);
// INTEL-FREE: UW stays off unless the flag is on AND a token is present.
assert.equal(isUnusualWhalesEnabled(() => ""), false);

console.log("TS source loadable: ok");
console.log(
  JSON.stringify({ realSourceModules: loaded.length, modules: loaded }, null, 2),
);
