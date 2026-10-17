import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  NEVER_CACHE_PREFIXES,
  PWA_CACHE_VERSION,
  PWA_OFFLINE_PATH,
  SAFE_API_PREFIXES,
  SAFE_NAV_PREFIXES,
  SW_CACHE_LAST_VIEWED_MESSAGE,
  SW_SKIP_WAITING_MESSAGE,
  isSafeApiGet,
  isSafeNavigation,
  isStaticAsset,
  shouldNeverCache,
} from "./cachePolicy";

const swSource = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

describe("PWA cache policy", () => {
  it("allows last-viewed app shells and rejects marketing home", () => {
    assert.equal(isSafeNavigation("/chat"), true);
    assert.equal(isSafeNavigation("/chart?symbol=XAUUSD"), true);
    assert.equal(isSafeNavigation("/intel/foo"), true);
    assert.equal(isSafeNavigation("/"), false);
    assert.equal(isSafeNavigation("/login"), false);
  });

  it("caches only safe GET APIs", () => {
    assert.equal(isSafeApiGet("/api/feed?limit=3"), true);
    assert.equal(isSafeApiGet("/api/quotes/prices"), true);
    assert.equal(isSafeApiGet("/api/cron/journal-sweep"), false);
    assert.equal(isSafeApiGet("/api/billing/checkout"), false);
    assert.equal(isSafeApiGet("/api/internal/key-health"), false);
  });

  it("never caches write or secret routes", () => {
    for (const prefix of NEVER_CACHE_PREFIXES) {
      assert.equal(shouldNeverCache(`${prefix}/x`), true);
    }
    assert.equal(shouldNeverCache("/api/feed"), false);
  });

  it("treats hashed Next assets as static", () => {
    assert.equal(isStaticAsset("/_next/static/chunks/app.js"), true);
    assert.equal(isStaticAsset("/axe-icon-192.png"), true);
    assert.equal(isStaticAsset("/api/feed"), false);
  });
});

describe("public/sw.js stays aligned with cachePolicy", () => {
  it("declares the same cache version and offline page", () => {
    assert.match(swSource, new RegExp(PWA_CACHE_VERSION));
    assert.match(swSource, new RegExp(`"${PWA_OFFLINE_PATH}"`));
  });

  it("implements fetch, last-viewed data cache, and an update handshake", () => {
    assert.match(swSource, /addEventListener\(\s*"fetch"/);
    assert.match(swSource, new RegExp(SW_CACHE_LAST_VIEWED_MESSAGE));
    assert.match(swSource, new RegExp(SW_SKIP_WAITING_MESSAGE));
    assert.match(swSource, /AXE_PUSH_OPEN/);
    assert.match(swSource, /skipWaiting/);
    assert.doesNotMatch(
      swSource,
      /self\.skipWaiting\(\);\s*\}\);\s*\n\s*\/\/ ── Activate/,
    );
  });

  it("lists every safe prefix so the worker cannot silently drop a route", () => {
    for (const prefix of [...SAFE_NAV_PREFIXES, ...SAFE_API_PREFIXES, ...NEVER_CACHE_PREFIXES]) {
      assert.match(swSource, new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});
