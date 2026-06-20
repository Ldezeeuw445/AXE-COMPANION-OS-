import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDemoQuotePrice, isDemoAccount } from "@/lib/broker/demoAccount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/quotes/prices
 *
 * Returns the latest bid/ask/price for all symbols in chart_live_snapshots
 * for the authenticated user's active account. Timeframe = "quote" rows
 * are written by the Node streamer every 3s.
 *
 * The Quotes page polls this endpoint every 2s for near-real-time updates.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonError(503, "supabase_not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  // Get active account
  const { data: prefs } = await supabase
    .from("user_workspace_preferences")
    .select("active_account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const activeId = prefs?.active_account_id as string | null | undefined;
  if (!activeId) return Response.json({ prices: {} });

  const { data: account } = await supabase
    .from("user_broker_accounts")
    .select("connection_method,provider")
    .eq("user_id", user.id)
    .eq("id", activeId)
    .maybeSingle();

  if (isDemoAccount(account)) {
    const { data: watchlist } = await supabase
      .from("assistant_memory_entries")
      .select("entry_key")
      .eq("user_id", user.id)
      .eq("scope", "watchlist")
      .order("created_at", { ascending: true });

    const symbols = (watchlist ?? [])
      .map((row) => String(row.entry_key ?? "").toUpperCase())
      .filter(Boolean);
    const tickMs = Date.now();
    const prices: Record<
      string,
      {
        bid: number | null;
        ask: number | null;
        price: number | null;
        spread: number | null;
        tickAt: string | null;
        status: string | null;
      }
    > = {};

    for (const sym of symbols) {
      const q = getDemoQuotePrice(sym, tickMs);
      prices[sym] = {
        bid: q.bid,
        ask: q.ask,
        price: q.price,
        spread: q.spread,
        tickAt: new Date(tickMs).toISOString(),
        status: "live",
      };
    }

    return Response.json({ prices }, { headers: { "Cache-Control": "no-store" } });
  }

  // Get all "quote" snapshots for this account
  const { data: snapshots, error } = await supabase
    .from("chart_live_snapshots")
    .select("display_symbol,broker_symbol,last_price,last_bid,last_ask,last_tick_at,status,updated_at")
    .eq("user_id", user.id)
    .eq("account_id", activeId)
    .eq("timeframe", "quote")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return jsonError(500, "query_failed");

  const prices: Record<
    string,
    {
      bid: number | null;
      ask: number | null;
      price: number | null;
      spread: number | null;
      tickAt: string | null;
      status: string | null;
    }
  > = {};

  for (const s of snapshots ?? []) {
    const sym = String(s.display_symbol ?? "").toUpperCase();
    if (!sym) continue;
    const bid = s.last_bid != null ? Number(s.last_bid) : null;
    const ask = s.last_ask != null ? Number(s.last_ask) : null;
    const spread = bid != null && ask != null ? Math.abs(ask - bid) : null;
    prices[sym] = {
      bid,
      ask,
      price: s.last_price != null ? Number(s.last_price) : null,
      spread,
      tickAt: (s.last_tick_at as string) ?? null,
      status: (s.status as string) ?? null,
    };
  }

  return Response.json({ prices }, { headers: { "Cache-Control": "no-store" } });
}

function jsonError(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
