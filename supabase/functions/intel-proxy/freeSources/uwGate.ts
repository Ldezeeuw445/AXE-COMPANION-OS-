/**
 * Unusual Whales is optional. Enable only when the flag is on and a token exists.
 * UNUSUAL_WHALES_ENABLED accepts: "1", "true", "yes", "on" (case-insensitive).
 * Token: UNUSUAL_WHALES_TOKEN, else UNUSUAL_WHALES_API_KEY (same as Next providerStatus).
 * Keep in sync with `src/lib/intel/freeSources/uwGate.ts`.
 */

export type EnvGet = (key: string) => string;

const ENABLED_FLAGS = new Set(["1", "true", "yes", "on"]);

export function isUnusualWhalesEnabled(envGet: EnvGet): boolean {
  const flag = envGet("UNUSUAL_WHALES_ENABLED").trim().toLowerCase();
  if (!ENABLED_FLAGS.has(flag)) return false;
  return Boolean(resolveUnusualWhalesToken(envGet));
}

export function resolveUnusualWhalesToken(envGet: EnvGet): string | null {
  const token = envGet("UNUSUAL_WHALES_TOKEN").trim();
  if (token) return token;
  const apiKey = envGet("UNUSUAL_WHALES_API_KEY").trim();
  return apiKey || null;
}

export function unusualWhalesHeaders(
  envGet: EnvGet,
): Record<string, string> | null {
  if (!isUnusualWhalesEnabled(envGet)) return null;
  const token = resolveUnusualWhalesToken(envGet);
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}
