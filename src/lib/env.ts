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
