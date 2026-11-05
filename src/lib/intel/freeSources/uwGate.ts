/**
 * Unusual Whales is optional. Enable only when both the flag and token are set.
 * Mirror of supabase/functions/intel-proxy/freeSources/uwGate.ts, and the same
 * flag rule as `envFlag` in intelSources.ts: only "true" (trimmed, any case)
 * turns it on. If the edge function accepted "1" while the app did not, the
 * proxy would spend UW calls on a feed the app reports as off.
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
