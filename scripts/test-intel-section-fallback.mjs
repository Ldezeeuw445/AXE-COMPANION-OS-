/**
 * INTEL-FREE — one failing source must not freeze the whole intel view.
 * Run: npm run test:intel-section-fallback
 *
 * No network / no secrets. Imports the real TypeScript module (no inline
 * mirror) so a broken or deleted source fails here instead of passing vacuously.
 *
 * Regression: fetchIntelSnapshot used to return the entire previous snapshot
 * (up to 24h old) whenever any single source errored, hiding fresh insider,
 * congress and FINRA rows behind e.g. a missing AIS key.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modPath = join(root, "src/lib/intel/freeSources/snapshotSectionFallback.ts");
const {
  INTEL_SECTION_BY_PROVIDER,
  mergeFailedSectionsFromCache,
  formatCachedAge,
  sectionHasRows,
} = await import(pathToFileURL(modPath).href);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

function provider(id, state, reason) {
  return { id, label: id, state, description: `${id} feed`, ...(reason ? { reason } : {}) };
}

function snapshot(overrides = {}, providers = []) {
  return {
    insiders: [],
    senate: [],
    shortVolume: [],
    darkPool: [],
    options: [],
    tide: null,
    jets: [],
    vessels: [],
    chokepoints: [],
    conflicts: [],
    energy: [],
    cyber: [],
    military: [],
    emergency: [],
    providers,
    hasLiveData: false,
    cache: { state: "fresh", ageSeconds: null },
    ...overrides,
  };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("intel-section-fallback");

test("failed section borrows cached rows; healthy sections stay fresh", () => {
  const fresh = snapshot(
    { insiders: [{ ticker: "NVDA", insider: "new" }], senate: [] },
    [
      provider("insiderTrades", "live"),
      provider("senateTrades", "error", "fmp_api_key_missing"),
    ],
  );
  const cached = {
    savedAt: NOW - 2 * HOUR,
    snapshot: snapshot({
      insiders: [{ ticker: "AAPL", insider: "old" }],
      senate: [{ politician: "Pelosi", ticker: "MSFT" }],
    }),
  };
  const { snapshot: out, carried, sectionSavedAt } = mergeFailedSectionsFromCache({
    fresh,
    cached,
    now: NOW,
    maxAgeMs: DAY,
  });
  assert.deepEqual(out.insiders, [{ ticker: "NVDA", insider: "new" }], "fresh insiders kept");
  assert.deepEqual(out.senate, [{ politician: "Pelosi", ticker: "MSFT" }], "congress from cache");
  assert.deepEqual(carried, ["senate"]);
  assert.equal(sectionSavedAt.insiders, NOW);
  assert.equal(sectionSavedAt.senate, NOW - 2 * HOUR, "carried rows keep original age");

  const senate = out.providers.find((p) => p.id === "senateTrades");
  assert.equal(senate.state, "error", "badge still says unavailable");
  assert.equal(senate.reason, "cached 2h · fmp_api_key_missing", "reason names cache + cause");
  assert.match(senate.description, /showing cached 2h rows/);
  assert.equal(out.providers.find((p) => p.id === "insiderTrades").reason, undefined);
});

test("does not mutate the fresh snapshot or its providers", () => {
  const fresh = snapshot({}, [provider("shortVolume", "error", "finra_cdn_503")]);
  const before = JSON.stringify(fresh);
  mergeFailedSectionsFromCache({
    fresh,
    cached: { savedAt: NOW - HOUR, snapshot: snapshot({ shortVolume: [{ symbol: "GME" }] }) },
    now: NOW,
    maxAgeMs: DAY,
  });
  assert.equal(JSON.stringify(fresh), before);
});

test("cache older than maxAge is not replayed", () => {
  const fresh = snapshot({}, [provider("shortVolume", "error", "finra_cdn_503")]);
  const { snapshot: out, carried } = mergeFailedSectionsFromCache({
    fresh,
    cached: { savedAt: NOW - 25 * HOUR, snapshot: snapshot({ shortVolume: [{ symbol: "GME" }] }) },
    now: NOW,
    maxAgeMs: DAY,
  });
  assert.deepEqual(out.shortVolume, []);
  assert.deepEqual(carried, []);
  assert.equal(out.providers[0].reason, "finra_cdn_503", "original reason untouched");
});

test("per-section age wins over entry savedAt (no laundering into fresh)", () => {
  const fresh = snapshot({}, [provider("senateTrades", "error", "x")]);
  const { carried } = mergeFailedSectionsFromCache({
    fresh,
    cached: {
      savedAt: NOW - HOUR,
      sectionSavedAt: { senate: NOW - 30 * HOUR },
      snapshot: snapshot({ senate: [{ politician: "A" }] }),
    },
    now: NOW,
    maxAgeMs: DAY,
  });
  assert.deepEqual(carried, [], "senate rows were already 30h old");
});

test("only error state borrows: off (no data) and live are left alone", () => {
  const fresh = snapshot({}, [provider("insiderTrades", "off"), provider("darkPoolPrints", "live")]);
  const { carried } = mergeFailedSectionsFromCache({
    fresh,
    cached: {
      savedAt: NOW - HOUR,
      snapshot: snapshot({ insiders: [{ t: 1 }], darkPool: [{ t: 2 }] }),
    },
    now: NOW,
    maxAgeMs: DAY,
  });
  assert.deepEqual(carried, []);
});

test("market tide (object section) can be carried", () => {
  const tide = { netCallPremium: 1, netPutPremium: 2 };
  const { snapshot: out, carried } = mergeFailedSectionsFromCache({
    fresh: snapshot({}, [provider("marketTide", "error", "finnhub_429")]),
    cached: { savedAt: NOW - 10 * 60_000, snapshot: snapshot({ tide }) },
    now: NOW,
    maxAgeMs: DAY,
  });
  assert.deepEqual(out.tide, tide);
  assert.deepEqual(carried, ["tide"]);
  assert.equal(out.providers[0].reason, "cached 10m · finnhub_429");
});

test("emergency squawks are never replayed from cache", () => {
  assert.equal(INTEL_SECTION_BY_PROVIDER.emergencyMonitor, undefined);
  const { snapshot: out } = mergeFailedSectionsFromCache({
    fresh: snapshot({}, [provider("emergencyMonitor", "error", "adsb_down")]),
    cached: { savedAt: NOW - 60_000, snapshot: snapshot({ emergency: [{ squawk: "7700" }] }) },
    now: NOW,
    maxAgeMs: DAY,
  });
  assert.deepEqual(out.emergency, []);
});

test("no cache: fresh snapshot returned unchanged in content", () => {
  const fresh = snapshot({ insiders: [{ t: 1 }] }, [
    provider("insiderTrades", "live"),
    provider("senateTrades", "error", "boom"),
  ]);
  const { snapshot: out, carried } = mergeFailedSectionsFromCache({ fresh, now: NOW, maxAgeMs: DAY });
  assert.deepEqual(carried, []);
  assert.deepEqual(out, fresh);
});

test("helpers", () => {
  assert.equal(sectionHasRows([]), false);
  assert.equal(sectionHasRows(null), false);
  assert.equal(sectionHasRows([1]), true);
  assert.equal(sectionHasRows({}), true);
  assert.equal(formatCachedAge(0), "0m");
  assert.equal(formatCachedAge(59 * 60_000), "59m");
  assert.equal(formatCachedAge(3 * HOUR), "3h");
  assert.equal(formatCachedAge(3 * DAY), "3d");
});

test("every mapped section exists on IntelSnapshot and covers all non-emergency providers", () => {
  const client = readFileSync(join(root, "src/lib/intel/intelClient.ts"), "utf8");
  const typeBlock = client.slice(
    client.indexOf("export type IntelSnapshot = {"),
    client.indexOf("providers: IntelProviderStatus[];"),
  );
  for (const key of Object.values(INTEL_SECTION_BY_PROVIDER)) {
    assert.match(typeBlock, new RegExp(`\\b${key}:`), `IntelSnapshot has ${key}`);
  }
  const idBlock = client.slice(
    client.indexOf("export type IntelProviderStatus = {"),
    client.indexOf("label: string;"),
  );
  const ids = [...idBlock.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 14, "parsed provider ids");
  for (const id of ids) {
    if (id === "emergencyMonitor") continue;
    assert.ok(INTEL_SECTION_BY_PROVIDER[id], `provider ${id} has a section mapping`);
  }
});

test("intelClient no longer swaps the whole snapshot on a single error", () => {
  const client = readFileSync(join(root, "src/lib/intel/intelClient.ts"), "utf8");
  assert.match(client, /mergeFailedSectionsFromCache\(/, "uses per-section merge");
  assert.doesNotMatch(
    client,
    /if \(hadError && cached[^{]*\{\s*return markCache\(\s*cached\.snapshot/,
    "old whole-snapshot fallback is gone",
  );
});

console.log(`\n${passed} checks passed`);
