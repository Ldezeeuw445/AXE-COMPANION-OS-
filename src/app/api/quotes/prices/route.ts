import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAlpacaSnapshots } from "@/lib/alpaca/client";
import { getAlpacaPaperConfig, isAlpacaConfigured } from "@/lib/alpaca/env";
import { isAlpacaAccount } from "@/lib/alpaca/provision";
import { isAlpacaSupportedSymbol, toAlpacaSymbol } from "@/lib/alpaca/symbols";
import { getDemoQuotePrice, isDemoAccount } from "@/lib/broker/demoAccount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuotePrice = {
  bid: number | null;
  ask: number | null;
  price: number | null;
  spread: number | null;
  tickAt: string | null;
  status: string | null;
};

/**
 * GET /api/quotes/prices
 *
 * Returns latest bid/ask for watchlist symbols on the active broker account.
 * Demo → synthetic ticks; Alpaca → live snapshots; MT5 → chart_live_snapshots stream.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonError(503, "supabase_not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

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
    return Response.json(
      { prices: await demoPrices(supabase, user.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (isAlpacaAccount(account)) {
    return Response.json(
      { prices: await alpacaPrices(supabase, user.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: snapshots, error } = await supabase
    .from("chart_live_snapshots")
    .select("display_symbol,broker_symbol,last_price,last_bid,last_ask,last_tick_at,status,updated_at")
    .eq("user_id", user.id)
    .eq("account_id", activeId)
    .eq("timeframe", "quote")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return jsonError(500, "query_failed");

  const prices: Record<string, QuotePrice> = {};
  for (const s of snapshots ?? []) {
    const sym = String(s.display_symbol ?? "").toUpperCase();
    if (!sym) continue;
    const bid = s.last_bid != null ? Number(s.last_bid) : null;
    const ask = s.last_ask != null ? Number(s.last_ask) : null;
    if (bid == null && ask == null && s.last_price == null) continue;
    prices[sym] = {
      bid,
      ask,
      price: s.last_price != null ? Number(s.last_price) : null,
      spread: bid != null && ask != null ? Math.abs(ask - bid) : null,
      tickAt: (s.last_tick_at as string) ?? null,
      status: (s.status as string) ?? null,
    };
  }

  return Response.json({ prices }, { headers: { "Cache-Control": "no-store" } });
}

async function demoPrices(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  userId: string,
): Promise<Record<string, QuotePrice>> {
  const { data: watchlist } = await supabase
    .from("assistant_memory_entries")
    .select("entry_key")
    .eq("user_id", userId)
    .eq("scope", "watchlist")
    .order("created_at", { ascending: true });

  const symbols = (watchlist ?? [])
    .map((row) => String(row.entry_key ?? "").toUpperCase())
    .filter(Boolean);
  const tickMs = Date.now();
  const prices: Record<string, QuotePrice> = {};

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

  return prices;
}

async function alpacaPrices(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  userId: string,
): Promise<Record<string, QuotePrice>> {
  const { data: watchlist } = await supabase
    .from("assistant_memory_entries")
    .select("entry_key")
    .eq("user_id", userId)
    .eq("scope", "watchlist")
    .order("created_at", { ascending: true });

  const symbols = (watchlist ?? [])
    .map((row) => String(row.entry_key ?? "").toUpperCase())
    .filter((s) => isAlpacaSupportedSymbol(s));

  const prices: Record<string, QuotePrice> = {};
  if (symbols.length === 0) return prices;

  const config = isAlpacaConfigured() ? getAlpacaPaperConfig() : null;
  if (!config) return prices;

  try {
    const tickers = symbols.map((s) => toAlpacaSymbol(s)).filter((s): s is string => Boolean(s));
    const snaps = await getAlpacaSnapshots(config, tickers);
    for (const sym of symbols) {
      const ticker = toAlpacaSymbol(sym);
      if (!ticker) continue;
      const snap = snaps[ticker];
      if (!snap) continue;
      const bid = snap.latestQuote?.bp ?? null;
      const ask = snap.latestQuote?.ap ?? null;
      const price = snap.latestTrade?.p ?? snap.minuteBar?.c ?? (bid != null && ask != null ? (bid + ask) / 2 : null);
      if (price == null && bid == null && ask == null) continue;
      prices[sym] = {
        bid,
        ask,
        price,
        spread: bid != null && ask != null ? Math.abs(ask - bid) : null,
        tickAt: snap.latestQuote?.t ?? snap.latestTrade?.t ?? new Date().toISOString(),
        status: "live",
      };
    }
  } catch (error) {
    console.warn("[quotes/prices] alpaca snapshots failed", error);
  }

  return prices;
}

function jsonError(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
