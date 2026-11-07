/**
 * Unusual Whales is optional. Enable only when both the flag and token are set.
 * UNUSUAL_WHALES_ENABLED must be "true" (trimmed, any case) — the same rule the
 * app uses in src/lib/intel/intelSources.ts, so both sides agree on "off".
 * Mirrored (and tested) in src/lib/intel/freeSources/uwGate.ts.
 */
export function isUnusualWhalesEnabled(envGet: (key: string) => string): boolean {
  const flag = envGet("UNUSUAL_WHALES_ENABLED").trim().toLowerCase();
  if (flag !== "true") return false;
  return Boolean(envGet("UNUSUAL_WHALES_TOKEN").trim());
}

export function unusualWhalesHeaders(
  envGet: (key: string) => string,
): Record<string, string> | null {
  if (!isUnusualWhalesEnabled(envGet)) return null;
  const token = envGet("UNUSUAL_WHALES_TOKEN").trim();
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}
