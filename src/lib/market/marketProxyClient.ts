import "server-only";
import { getSupabaseKey, getSupabaseServiceRoleKey } from "@/lib/env";

/**
 * Server-only auth for the market-proxy Edge Function.
 *
 * Preference: EDGE_SECRET, then CRON_SECRET (same value as IONOS crontab).
 * Fallback: SUPABASE_SERVICE_ROLE_KEY so production keeps working before a
 * dedicated secret is set. Never send the public anon/publishable key —
 * that is what let anonymous callers burn FRED/Finnhub quota.
 */
export function getMarketProxySharedSecret(): string | null {
  const dedicated =
    process.env.EDGE_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  if (dedicated) return dedicated;
  return getSupabaseServiceRoleKey() ?? null;
}

export function getMarketProxyRequest(): {
  url: string;
  headers: Record<string, string>;
} | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = getSupabaseKey();
  const secret = getMarketProxySharedSecret();
  if (!base || !anonKey || !secret) return null;
  return {
    url: `${base}/functions/v1/market-proxy`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
      apikey: anonKey,
    },
  };
}
