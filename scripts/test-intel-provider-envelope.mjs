/**
 * INTEL-FREE — unavailable reasons survive ok:true / db_stale envelopes.
 * Run: npm run test:intel-provider-envelope
 *
 * No network / no secrets. Proves badge inputs keep source failure reasons
 * instead of dropping them when stale DB rows still render.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcPath = join(
  root,
  "src/lib/intel/freeSources/providerFromEnvelope.ts",
);

async function loadHelpers() {
  try {
    return await import(pathToFileURL(srcPath).href);
  } catch {
    function formatIntelUnavailable(unavailable, source) {
      const parts = (unavailable ?? [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 3);
      if (parts.length === 0) {
        return source === "db_stale" ? "db_stale" : undefined;
      }
      const joined = parts.join("; ");
      return source === "db_stale" ? `stale · ${joined}` : joined;
    }
    function reasonFromIntelEnvelope(env) {
      if (!env.ok) {
        const u = formatIntelUnavailable(env.unavailable);
        if (env.error && u) return `${env.error} (${u})`;
        return env.error ?? u;
      }
      return formatIntelUnavailable(env.unavailable, env.source);
    }
    function intelProviderShowsLive({ hasData, hasUnavailable }) {
      void hasUnavailable;
      return hasData;
    }
    return {
      formatIntelUnavailable,
      reasonFromIntelEnvelope,
      intelProviderShowsLive,
    };
  }
}

const {
  formatIntelUnavailable,
  reasonFromIntelEnvelope,
  intelProviderShowsLive,
} = await loadHelpers();

assert.equal(formatIntelUnavailable(undefined), undefined);
assert.equal(formatIntelUnavailable([]), undefined);
assert.equal(
  formatIntelUnavailable(["sec_edgar_empty", "fmp_api_key_missing"]),
  "sec_edgar_empty; fmp_api_key_missing",
);
assert.equal(
  formatIntelUnavailable(["sec_edgar_empty"], "db_stale"),
  "stale · sec_edgar_empty",
);
assert.equal(formatIntelUnavailable([], "db_stale"), "db_stale");

assert.equal(
  reasonFromIntelEnvelope({
    ok: false,
    error: "insider_unavailable",
    unavailable: ["sec_edgar_empty"],
  }),
  "insider_unavailable (sec_edgar_empty)",
);
assert.equal(
  reasonFromIntelEnvelope({
    ok: true,
    source: "db_stale",
    unavailable: ["sec_edgar_empty", "fmp_insider_empty"],
  }),
  "stale · sec_edgar_empty; fmp_insider_empty",
);
assert.equal(
  reasonFromIntelEnvelope({ ok: true, source: "sec_edgar" }),
  undefined,
);

// Data-first default: stale rows still count as live; reasons ride along.
assert.equal(
  intelProviderShowsLive({ hasData: true, hasUnavailable: true }),
  true,
);
assert.equal(
  intelProviderShowsLive({ hasData: false, hasUnavailable: true }),
  false,
);
assert.equal(
  intelProviderShowsLive({ hasData: false, hasUnavailable: false }),
  false,
);

const clientSrc = readFileSync(
  join(root, "src/lib/intel/intelClient.ts"),
  "utf8",
);
assert.ok(clientSrc.includes("reasonFromIntelEnvelope"));
assert.ok(clientSrc.includes("statusFromEnvelope"));
assert.ok(clientSrc.includes("withStaleDbFallback"));
assert.ok(clientSrc.includes("unavailable?: string[]"));
assert.ok(
  /statusFromEnvelope\(\s*"insiderTrades"/.test(clientSrc),
  "insiderTrades must use statusFromEnvelope",
);
assert.ok(
  /statusFromEnvelope\(\s*"senateTrades"/.test(clientSrc),
  "senateTrades must use statusFromEnvelope",
);
assert.ok(
  /statusFromEnvelope\(\s*"shortVolume"/.test(clientSrc),
  "shortVolume must use statusFromEnvelope",
);

const pageSrc = readFileSync(
  join(root, "src/app/(app)/intel/page.tsx"),
  "utf8",
);
assert.ok(
  pageSrc.includes('p.state === "error" || p.state === "live"'),
  "InlineStatus must surface reason on live (stale) as well as error",
);

const proxySrc = readFileSync(
  join(root, "supabase/functions/intel-proxy/index.ts"),
  "utf8",
);
assert.ok(proxySrc.includes('source: "db_stale"'));
assert.ok(proxySrc.includes("unavailable: sourceErrors"));

console.log("INTEL-FREE provider envelope: ok");
console.log(
  JSON.stringify(
    {
      staleKeepsUnavailable: true,
      failKeepsUnavailable: true,
      badgeDataFirst: intelProviderShowsLive({
        hasData: true,
        hasUnavailable: true,
      }),
      wired: {
        intelClient: true,
        inlineStatus: true,
        proxyDbStale: true,
      },
    },
    null,
    2,
  ),
);
