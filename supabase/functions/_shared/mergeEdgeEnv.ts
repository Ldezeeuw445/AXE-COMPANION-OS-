/**
 * Merge optional EDGE_PROVIDER_KEYS_JSON into Deno.env for Edge functions.
 * Individual non-empty secrets always win over the JSON blob.
 */

const JSON_BLOB_SECRET_NAMES = [
  "EDGE_PROVIDER_KEYS_JSON",
  "TRADING_OS_EDGE_KEYS_JSON",
  "EDGE_SECRETS_JSON",
] as const;

function snapshotEnv(): Record<string, string> {
  const base: Record<string, string> = {};
  try {
    if (typeof Deno.env.toObject === "function") {
      return { ...Deno.env.toObject() };
    }
  } catch {
    /* Edge runtime may not expose toObject */
  }
  for (const key of Deno.env.keys()) {
    const v = Deno.env.get(key);
    if (v != null) base[key] = v;
  }
  return base;
}

export function getMergedEdgeEnv(): Record<string, string> {
  const base: Record<string, string> = snapshotEnv();

  for (const blobName of JSON_BLOB_SECRET_NAMES) {
    const raw = (base[blobName] ?? "").trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v !== "string") continue;
        const t = v.trim();
        if (!t) continue;
        const cur = (base[k] ?? "").trim();
        if (!cur) base[k] = t;
      }
    } catch {
      console.warn("merge_edge_env: invalid_json", blobName);
    }
  }

  return base;
}
