import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig, getSupabaseKey } from "@/lib/env";

const PROTECTED_PREFIXES = [
  "/chart",
  "/chat",
  "/cockpit",
  "/history",
  "/intel",
  "/journal",
  "/market",
  "/accounts",
  "/alerts",
  "/positions",
  "/vault",
  "/watchlist",
  "/actions",
  "/settings",
  "/upgrade",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const pathEarly = request.nextUrl.pathname;

  // Skip auth check on these paths entirely
  if (
    pathEarly.startsWith("/api/") ||
    pathEarly.startsWith("/_next/") ||
    pathEarly === "/login" ||
    pathEarly === "/welcome" ||
    pathEarly === "/"
  ) {
    return NextResponse.next({ request });
  }

  // Skip Stripe webhooks
  if (pathEarly.startsWith("/api/stripe/") || pathEarly === "/api/stripe") {
    return NextResponse.next({ request });
  }

  if (pathEarly.startsWith("/demo/embed")) {
    const res = NextResponse.next({ request });
    res.headers.set("X-Frame-Options", "SAMEORIGIN");
    res.headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'self'"
    );
    return res;
  }

  let supabaseResponse = NextResponse.next({ request });
  let user: { id: string } | null = null;

  if (hasSupabaseConfig()) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      getSupabaseKey()!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    try {
      // Add 5-second timeout to prevent indefinite hangs
      const userPromise = supabase.auth.getUser();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Auth timeout")), 5000)
      );

      const {
        data: { user: u },
      } = await Promise.race([userPromise, timeoutPromise]) as any;
      user = u;
    } catch (error) {
      // If auth check times out or fails, let the request through
      // (protected pages will redirect to login via client-side checks)
      console.error("[middleware] Auth check error:", error);
    }
  }

  const path = request.nextUrl.pathname;

  if (path === "/welcome" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  if (path === "/" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  if (isProtectedPath(path) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (path === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  if (request.nextUrl.searchParams.get("embed") === "1") {
    supabaseResponse.headers.set("X-Frame-Options", "SAMEORIGIN");
    supabaseResponse.headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'self'"
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next|static|favicon\\.ico).*)",
  ],
};
