import { firstNonEmptyEnv } from "@/lib/envFallback";

export function getSupabaseKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  );
}

export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getSupabaseKey());
}

/**
 * Returns true when we should use mock/demo data instead of live Supabase.
 *
 * Priority order:
 *   1. NEXT_PUBLIC_DATA_SOURCE=mock | demo → always mock
 *   2. NEXT_PUBLIC_DATA_SOURCE=supabase    → always live
 *   3. Auto-detect: if Supabase URL + anon key are both present → live
 *   4. Otherwise → mock (dev fallback)
 *
 * This means you do NOT need to set NEXT_PUBLIC_DATA_SOURCE on IONOS as long
 * as NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
 */
export function isMockDataSource(): boolean {
  const dataSource = process.env.NEXT_PUBLIC_DATA_SOURCE?.toLowerCase().trim();

  // Explicit mock
  if (dataSource === "mock" || dataSource === "demo") return true;

  // Explicit live
  if (dataSource === "supabase") return false;

  // Auto-detect from configured keys — if Supabase is set up, use it
  return !hasSupabaseConfig();
}

const APEX_HOST = "axecompanion.com";
const CANONICAL_WWW_HOST = "www.axecompanion.com";

/**
 * Canonical public origin (no trailing slash). Apex `axecompanion.com` is
 * rewritten to `www` so Stripe, push, QR, and metadata stay on the live host
 * even when NEXT_PUBLIC_APP_URL is set without www.
 */
export function normalizePublicAppBaseUrl(
  raw: string | undefined | null,
  fallback = "http://localhost:5000",
): string {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback.replace(/\/$/, "");
  try {
    const url = new URL(trimmed);
    if (url.hostname.toLowerCase() === APEX_HOST) {
      url.hostname = CANONICAL_WWW_HOST;
    }
    return url.origin;
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

/** Public site URL (no trailing slash). Used for QR, push links, canonical checks. */
export function getPublicAppBaseUrl(): string {
  return normalizePublicAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL, "http://localhost:5000");
}

/**
 * Web-push public key. Production already ships NEXT_PUBLIC_VAPID_PUBLIC_KEY;
 * VAPID_PUBLIC_KEY is accepted as a server-only alias so a second env var is
 * not required.
 */
export function getVapidPublicKey(): string | undefined {
  return firstNonEmptyEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PUBLIC_KEY") ?? undefined;
}

/**
 * Web-push subject. Required by web-push; an empty VAPID_SUBJECT used to
 * silently skip every delivery. Fall back to a mailto on the public host.
 */
export function getVapidSubject(): string | undefined {
  const explicit = firstNonEmptyEnv("VAPID_SUBJECT");
  if (explicit) return explicit;
  try {
    const host = new URL(getPublicAppBaseUrl()).hostname;
    if (host) return `mailto:alerts@${host}`;
  } catch {
    /* keep going */
  }
  return undefined;
}

/**
 * Server-only Supabase service-role key. Used by webhook routes that operate
 * without a user session (Stripe, push delivery, scheduled jobs) and need to
 * write tables guarded by RLS. Never expose to the client.
 */
export function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

/** Stripe restricted/secret key for the webhook + (future) checkout creation. */
export function getStripeSecretKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY?.trim() || undefined;
}

/**
 * Stripe webhook signing secret. Each webhook endpoint configured in the
 * Stripe Dashboard has its own secret — copy it into STRIPE_WEBHOOK_SECRET
 * for this deployment.
 */
export function getStripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
}
