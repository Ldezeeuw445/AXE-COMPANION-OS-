import { createBrowserClient } from "@supabase/ssr";
import { hasSupabaseConfig, getSupabaseKey } from "@/lib/env";

export function createClient() {
  if (!hasSupabaseConfig()) {
    throw new Error(
      "Supabase env vars are not set. Use private demo sign-in or add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)."
    );
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseKey()!
  );
}
