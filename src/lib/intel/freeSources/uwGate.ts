/**
 * INTEL-FREE — Unusual Whales stays optional behind UNUSUAL_WHALES_ENABLED.
 * Free insider / congress / short-volume sources do not require this gate.
 *
 * Token resolution matches Next providerStatus: prefer UNUSUAL_WHALES_TOKEN,
 * fall back to UNUSUAL_WHALES_API_KEY. Keep in sync with
 * `supabase/functions/intel-proxy/freeSources/uwGate.ts`.
 */

export type EnvGet = (key: string) => string;

const ENABLED_FLAGS = new Set(["1", "true", "yes", "on"]);

/** Flag on + non-empty token (TOKEN or API_KEY). */
export function isUnusualWhalesEnabled(envGet: EnvGet): boolean {
  const flag = envGet("UNUSUAL_WHALES_ENABLED").trim().toLowerCase();
  if (!ENABLED_FLAGS.has(flag)) return false;
  return Boolean(resolveUnusualWhalesToken(envGet));
}

/**
 * Raw credential when the opt-in flag is on; otherwise null.
 * Callers that only need “is UW configured for status UI” use this after the flag check.
 */
export function resolveUnusualWhalesToken(envGet: EnvGet): string | null {
  const token = envGet("UNUSUAL_WHALES_TOKEN").trim();
  if (token) return token;
  const apiKey = envGet("UNUSUAL_WHALES_API_KEY").trim();
  return apiKey || null;
}

/** Bearer headers for UW HTTP calls, or null when opt-in is off / token missing. */
export function unusualWhalesHeaders(envGet: EnvGet): Record<string, string> | null {
  if (!isUnusualWhalesEnabled(envGet)) return null;
  const token = resolveUnusualWhalesToken(envGet);
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}
