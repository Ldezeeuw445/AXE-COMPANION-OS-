/**
 * Shared-secret gate for server-to-server Edge Functions.
 * Compares Authorization: Bearer against EDGE_SECRET, CRON_SECRET, and
 * (as a production fallback) SUPABASE_SERVICE_ROLE_KEY. Never accepts the
 * public anon / publishable key.
 */

function trim(value: string | undefined): string {
  return (value ?? "").trim();
}

function timingSafeEqualString(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const len = Math.max(aBytes.length, bBytes.length);
  let mismatch = aBytes.length === bBytes.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    mismatch |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return mismatch === 0;
}

export function extractBearerToken(req: Request): string {
  const raw = req.headers.get("authorization") ?? "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return trim(match?.[1]);
}

export function resolveSharedSecrets(env: Record<string, string>): string[] {
  const secrets = [env.EDGE_SECRET, env.CRON_SECRET, env.SUPABASE_SERVICE_ROLE_KEY]
    .map(trim)
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
  return secrets;
}

export function bearerMatchesSharedSecret(provided: string, expected: string[]): boolean {
  if (!provided || expected.length === 0) return false;
  let matched = false;
  for (const secret of expected) {
    if (timingSafeEqualString(provided, secret)) matched = true;
  }
  return matched;
}
