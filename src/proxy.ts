import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig, getSupabaseKey } from "@/lib/env";
import { isAnonymousUser } from "@/lib/auth/anonymousSessions";
import { SESSION_COOKIE, parseActiveSession, pathForTab } from "@/lib/session/activeSession";

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
  // A prefix has to end at a path boundary. A bare `startsWith` meant
  // `/market` also matched `/marketing/...`, which is why the dev screenshot
  // routes needed an explicit bypass above — and why `npm run capture:marketing`
  // had been quietly photographing the login page. The bypass stays (it is
  // cheaper than an auth round-trip), but the matcher is no longer wrong.
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  const pathEarly = request.nextUrl.pathname;

  // Skip auth check on these paths entirely
  if (
    pathEarly.startsWith("/api/") ||
    // The MetaApi streamer posts ticks here; it carries a shared secret, not a
    // session, and this path has no /api prefix because it mirrors the
    // Cloudflare worker's route.
    pathEarly === "/internal/publish" ||
    pathEarly.startsWith("/_next/") ||
    pathEarly === "/login" ||
    pathEarly === "/welcome" ||
    pathEarly === "/" ||
    pathEarly.startsWith("/marketing")
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
      const timeoutPromise = new Promise<Awaited<ReturnType<typeof supabase.auth.getUser>>>(
        (_, reject) => setTimeout(() => reject(new Error("Auth timeout")), 5000)
      );

      const {
        data: { user: u },
      } = await Promise.race([userPromise, timeoutPromise]);
      // An anonymous session is signed out, everywhere.
      //
      // Measured 2026-10-17: this was a bare `user = u`, while the check meant
      // to hold it (verify-no-anonymous-auth) was reading
      // src/lib/supabase/middleware.ts — a file nothing has imported since Next
      // renamed middleware to proxy. It asserted against dead code and passed,
      // while the live middleware handed anonymous JWTs to every protected
      // page. The app no longer mints one, but the Supabase project switch is a
      // dashboard setting this code cannot flip, so a token minted elsewhere
      // has to die here too.
      user = isAnonymousUser(u) ? null : u;
    } catch (error) {
      // If auth check times out or fails, let the request through
      // (protected pages will redirect to login via client-side checks)
      console.error("[middleware] Auth check error:", error);
    }
  }

  const path = request.nextUrl.pathname;

  const lastTabPath = pathForTab(parseActiveSession(request.cookies.get(SESSION_COOKIE)?.value)?.lastTab ?? "axe");

  if (path === "/welcome" && user) {
    const url = request.nextUrl.clone();
    url.pathname = lastTabPath;
    return NextResponse.redirect(url);
  }

  if (path === "/" && user) {
    const url = request.nextUrl.clone();
    url.pathname = lastTabPath;
    return NextResponse.redirect(url);
  }

  if (isProtectedPath(path) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (path === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = lastTabPath;
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
