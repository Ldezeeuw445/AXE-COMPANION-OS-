export function getSupabaseKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  );
}

export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getSupabaseKey());
}

export function isMockDataSource(): boolean {
  return process.env.NEXT_PUBLIC_DATA_SOURCE?.toLowerCase() !== "supabase";
}

/** Public site URL (no trailing slash). Used for QR, push links, canonical checks. */
export function getPublicAppBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "http://localhost:5000";
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
