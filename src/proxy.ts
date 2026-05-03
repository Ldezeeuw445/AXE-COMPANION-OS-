import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig, getSupabaseKey } from "@/lib/env";

/**
 * Supabase SSR session refresh proxy (Next.js 16 convention).
 * Refreshes the access token on every request so server-side auth.getUser()
 * always returns the authenticated user — even after the 1-hour JWT expiry.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (!hasSupabaseConfig()) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refreshes the access token if expired — writes updated cookies to response
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
