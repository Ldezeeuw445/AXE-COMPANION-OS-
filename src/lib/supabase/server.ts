import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hasSupabaseConfig, getSupabaseKey } from "@/lib/env";

export async function createServerSupabaseClient() {
  if (!hasSupabaseConfig()) {
    return null;
  }
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseKey()!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* ignore in Server Components */
          }
        },
      },
    }
  );
}
