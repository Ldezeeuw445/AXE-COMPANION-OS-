/**
 * Unusual Whales is optional. Enable only when both the flag and token are set.
 * UNUSUAL_WHALES_ENABLED accepts: "1", "true", "yes", "on" (case-insensitive).
 */
export function isUnusualWhalesEnabled(envGet: (key: string) => string): boolean {
  const flag = envGet("UNUSUAL_WHALES_ENABLED").trim().toLowerCase();
  if (!flag) return false;
  if (!["1", "true", "yes", "on"].includes(flag)) return false;
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
