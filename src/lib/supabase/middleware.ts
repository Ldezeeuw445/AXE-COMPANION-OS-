import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig, getSupabaseKey } from "@/lib/env";

const PROTECTED_PREFIXES = [
  "/chat",
  "/history",
  "/journal",
  "/accounts",
  "/alerts",
  "/vault",
  "/actions",
  "/cockpit",
  "/settings",
  "/upgrade",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

const APEX_HOST = "axecompanion.com";
const CANONICAL_WWW_HOST = "www.axecompanion.com";

export async function updateSession(request: NextRequest) {
  const host = request.nextUrl.hostname.toLowerCase();
  if (host === APEX_HOST) {
    const u = request.nextUrl.clone();
    u.hostname = CANONICAL_WWW_HOST;
    return NextResponse.redirect(u, 308);
  }

  const pathEarly = request.nextUrl.pathname;
  if (pathEarly.startsWith("/marketing")) {
    return NextResponse.next({ request });
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
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    user = u;
  }

  const path = request.nextUrl.pathname;

  if (path === "/welcome" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  if (path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/chat" : "/welcome";
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

  return supabaseResponse;
}
