import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

import { hasSupabaseConfig, getSupabaseKey } from "@/lib/env";
import { siteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where the confirmation email lands.
 *
 * One Supabase project serves AXE Companion, Trading OS and AXE Core, so the
 * project-wide Site URL can only ever point at one of them — and it points at
 * AXE Core. signUp() was called without emailRedirectTo, so every Companion
 * confirmation link sent the new user to the wrong app. This route is the
 * destination Companion now names explicitly.
 *
 * Handles both shapes Supabase can send, because which one arrives depends on
 * project settings rather than on anything in this codebase:
 *   - PKCE:      ?code=...
 *   - OTP link:  ?token_hash=...&type=signup
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  // Only ever an in-app path, never an absolute URL from the query string —
  // an open redirect on the auth callback is how phishing links get their
  // credibility.
  const rawNext = url.searchParams.get("next") ?? "/chat";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/chat";

  const failed = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, siteUrl()));

  if (!hasSupabaseConfig()) return failed("auth_not_configured");
  if (!code && !tokenHash) return failed("missing_confirmation_token");

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseKey()!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: type ?? "email", token_hash: tokenHash! });

  if (error) {
    console.error("[auth/confirm] verification failed", error.message);
    return failed(error.message);
  }

  return NextResponse.redirect(new URL(next, siteUrl()));
}
