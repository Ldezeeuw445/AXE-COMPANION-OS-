import { createServerClient } from "@supabase/ssr";

/**
 * Edge-compatible Supabase client that parses cookies from Request headers.
 * Use this in Edge Functions instead of createServerSupabaseClient()
 * which depends on next/headers (not available in Edge runtime).
 */
export function createEdgeSupabaseClient(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split("; ").filter(Boolean).map((c) => {
      const [name, ...rest] = c.trim().split("=");
      return [name, rest.join("=")];
    })
  );

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(cookies).map(([name, value]) => ({
            name,
            value,
          }));
        },
        setAll() {
          // Cookies are read-only in Edge Functions
          // Response cookies must be handled by the route itself
        },
      },
    }
  );
}

/** Get authenticated user from Edge Supabase client */
export async function getEdgeAuthedUser(request: Request) {
  const supabase = createEdgeSupabaseClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}
