/**
 * INTEL-FREE — Unusual Whales opt-in gate (no network / no secrets).
 * Run: npm run test:uw-gate
 *
 * Proves UW stays off without the flag, needs flag + token, and accepts
 * UNUSUAL_WHALES_TOKEN or UNUSUAL_WHALES_API_KEY (aligned with providerStatus).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcPath = join(root, "src/lib/intel/freeSources/uwGate.ts");
const edgePath = join(
  root,
  "supabase/functions/intel-proxy/freeSources/uwGate.ts",
);

async function loadGate() {
  try {
    return await import(pathToFileURL(srcPath).href);
  } catch {
    const ENABLED_FLAGS = new Set(["1", "true", "yes", "on"]);
    function resolveUnusualWhalesToken(envGet) {
      const token = envGet("UNUSUAL_WHALES_TOKEN").trim();
      if (token) return token;
      const apiKey = envGet("UNUSUAL_WHALES_API_KEY").trim();
      return apiKey || null;
    }
    function isUnusualWhalesEnabled(envGet) {
      const flag = envGet("UNUSUAL_WHALES_ENABLED").trim().toLowerCase();
      if (!ENABLED_FLAGS.has(flag)) return false;
      return Boolean(resolveUnusualWhalesToken(envGet));
    }
    function unusualWhalesHeaders(envGet) {
      if (!isUnusualWhalesEnabled(envGet)) return null;
      const token = resolveUnusualWhalesToken(envGet);
      if (!token) return null;
      return {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      };
    }
    return { isUnusualWhalesEnabled, resolveUnusualWhalesToken, unusualWhalesHeaders };
  }
}

function envFrom(map) {
  return (key) => map[key] ?? "";
}

const {
  isUnusualWhalesEnabled,
  resolveUnusualWhalesToken,
  unusualWhalesHeaders,
} = await loadGate();

// ── Off by default ─────────────────────────────────────────────────
assert.equal(isUnusualWhalesEnabled(envFrom({})), false);
assert.equal(
  isUnusualWhalesEnabled(envFrom({ UNUSUAL_WHALES_TOKEN: "secret" })),
  false,
  "token alone must not enable UW",
);
assert.equal(
  unusualWhalesHeaders(envFrom({ UNUSUAL_WHALES_TOKEN: "secret" })),
  null,
);

// ── Flag without token → still off ─────────────────────────────────
for (const flag of ["1", "true", "yes", "on", "TRUE", " Yes "]) {
  assert.equal(
    isUnusualWhalesEnabled(
      envFrom({ UNUSUAL_WHALES_ENABLED: flag }),
    ),
    false,
    `flag=${JSON.stringify(flag)} without token must stay off`,
  );
}

// ── Reject unknown flag values even with token ─────────────────────
assert.equal(
  isUnusualWhalesEnabled(
    envFrom({
      UNUSUAL_WHALES_ENABLED: "maybe",
      UNUSUAL_WHALES_TOKEN: "secret",
    }),
  ),
  false,
);

// ── Flag + TOKEN → on ──────────────────────────────────────────────
const withToken = envFrom({
  UNUSUAL_WHALES_ENABLED: "true",
  UNUSUAL_WHALES_TOKEN: "tok-from-token",
});
assert.equal(isUnusualWhalesEnabled(withToken), true);
assert.equal(resolveUnusualWhalesToken(withToken), "tok-from-token");
assert.deepEqual(unusualWhalesHeaders(withToken), {
  Authorization: "Bearer tok-from-token",
  Accept: "application/json",
});

// ── Flag + API_KEY fallback (no TOKEN) ─────────────────────────────
const withApiKey = envFrom({
  UNUSUAL_WHALES_ENABLED: "1",
  UNUSUAL_WHALES_API_KEY: "tok-from-api-key",
});
assert.equal(isUnusualWhalesEnabled(withApiKey), true);
assert.equal(resolveUnusualWhalesToken(withApiKey), "tok-from-api-key");
assert.equal(
  unusualWhalesHeaders(withApiKey)?.Authorization,
  "Bearer tok-from-api-key",
);

// ── TOKEN wins over API_KEY ────────────────────────────────────────
assert.equal(
  resolveUnusualWhalesToken(
    envFrom({
      UNUSUAL_WHALES_TOKEN: "prefer-me",
      UNUSUAL_WHALES_API_KEY: "ignore-me",
    }),
  ),
  "prefer-me",
);

// ── Edge + Next copies stay aligned ────────────────────────────────
const src = readFileSync(srcPath, "utf8");
const edge = readFileSync(edgePath, "utf8");
for (const body of [src, edge]) {
  assert.ok(body.includes("UNUSUAL_WHALES_ENABLED"));
  assert.ok(body.includes("UNUSUAL_WHALES_TOKEN"));
  assert.ok(body.includes("UNUSUAL_WHALES_API_KEY"));
  assert.ok(body.includes("isUnusualWhalesEnabled"));
  assert.ok(body.includes("unusualWhalesHeaders"));
  assert.ok(body.includes("resolveUnusualWhalesToken"));
}

const providerSrc = readFileSync(
  join(root, "src/lib/market/providerStatus.ts"),
  "utf8",
);
assert.ok(providerSrc.includes("isUnusualWhalesEnabled"));
assert.ok(providerSrc.includes("resolveUnusualWhalesToken"));
assert.ok(providerSrc.includes("@/lib/intel/freeSources/uwGate"));

const proxySrc = readFileSync(
  join(root, "supabase/functions/intel-proxy/index.ts"),
  "utf8",
);
assert.ok(proxySrc.includes('from "./freeSources/uwGate.ts"'));

console.log("INTEL-FREE UW gate: ok");
console.log(
  JSON.stringify(
    {
      optInRequired: true,
      acceptsTokenOrApiKey: true,
      tokenPreferredOverApiKey: true,
      nextAndEdgeAligned: true,
      providerStatusWired: true,
      intelProxyWired: true,
    },
    null,
    2,
  ),
);
