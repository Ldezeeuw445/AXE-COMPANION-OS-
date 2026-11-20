import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Trading OS (tradingosapp.com) is the same app on the same Supabase login,
 * with another interface. It calls a few Companion routes cross-origin with
 * the user's access token as a Bearer header — no cookies, so no
 * Allow-Credentials. Same pattern as /api/chat/stream.
 */
export const TRADING_OS_ORIGINS = new Set(["https://tradingosapp.com", "https://www.tradingosapp.com"]);

export function tradingOsCors(request: Request, methods = "POST, OPTIONS"): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const headers: Record<string, string> = { Vary: "Origin" };
  if (TRADING_OS_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = methods;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

/** Copy of a response with the Trading OS CORS headers added. */
export function withTradingOsCors(request: Request, res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(tradingOsCors(request))) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * The signed-in user and a Supabase client that acts as them (RLS applies):
 * the cookie session first, else a Bearer access token. Never a service role.
 */
export async function userSupabaseFromRequest(
  request: Request,
): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const cookieClient = await createServerSupabaseClient();
  if (cookieClient) {
    const {
      data: { user },
    } = await cookieClient.auth.getUser();
    if (user) return { supabase: cookieClient as unknown as SupabaseClient, user };
  }

  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || "";
  if (!token || !url || !anon) return null;

  const client = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);
  if (error || !user) return null;
  return { supabase: client, user };
}
