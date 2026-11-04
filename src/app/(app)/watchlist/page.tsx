import { WatchlistPageScreen } from "@/components/watchlist/WatchlistPageScreen";
import { listWatchlistItems } from "@/app/(app)/settings/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cleanDisplaySymbol, resolveBrokerSymbol } from "@/lib/broker/symbolResolution";
import { brokerPricingState } from "@/lib/runtime/runtimeTruth";
import { getMetadataSymbolMap, getMetadataSymbolReport, getMetadataSymbolUniverse } from "@/lib/broker/brokerSymbolRuntime";
import { mapWatchlistToAccountQuotes } from "@/lib/mt5/accountQuotesSync";
import { getDemoQuotePrice, isDemoAccount } from "@/lib/broker/demoAccount";
import { isAlpacaAccount } from "@/lib/alpaca/provision";
import { isAlpacaSupportedSymbol } from "@/lib/alpaca/symbols";

export default async function WatchlistPage() {
  const items = await listWatchlistItems();
  const supabase = await createServerSupabaseClient();
  if (!supabase) return <WatchlistPageScreen items={items} />;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <WatchlistPageScreen items={items} />;

  const { data: prefs } = await supabase
    .from("user_workspace_preferences")
    .select("active_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const activeId = (prefs?.active_account_id as string | null | undefined) ?? null;
  if (!activeId) return <WatchlistPageScreen items={items} />;

  const { data: account } = await supabase
    .from("user_broker_accounts")
    .select("id,label,connection_method,provider_status,metadata")
    .eq("user_id", user.id)
    .eq("id", activeId)
    .maybeSingle();

  const metadata = ((account?.metadata ?? {}) as Record<string, unknown>) ?? {};
  const universe = getMetadataSymbolUniverse(metadata);
  const map = getMetadataSymbolMap(metadata);
  const report = getMetadataSymbolReport(metadata);
  const connected = ["connected", "provisioned"].includes(String(account?.provider_status ?? "").toLowerCase());
  const demoMode = isDemoAccount(account);
  const alpacaMode = isAlpacaAccount(account);
  const mt5Mode = !demoMode && !alpacaMode && account?.connection_method === "cloud_mt5";

  // Canonical AXE watchlist never changes with the account. Quotes = watchlist
  // mapped to this account's broker symbols (omit what the broker doesn't offer).
  const watchlistSymbols = items.map((i) => i.symbol);
  const quotesMapping = mt5Mode
    ? mapWatchlistToAccountQuotes(watchlistSymbols, map, universe)
    : {
        available: items.map((i) => {
          const canonical = cleanDisplaySymbol(i.symbol) || i.symbol.trim().toUpperCase();
          return { canonical, broker: canonical };
        }),
        unavailable: [] as string[],
      };

  const unavailableNote =
    mt5Mode && quotesMapping.unavailable.length > 0 ? quotesMapping.unavailable : [];

  const itemByCanonical = new Map(
    items.map((item) => {
      const key = (cleanDisplaySymbol(item.symbol) || item.symbol.trim().toUpperCase()).toUpperCase();
      return [key, item] as const;
    }),
  );

  const baseItems = quotesMapping.available.map((row, idx) => {
    const source = itemByCanonical.get(row.canonical.toUpperCase());
    return {
      id: source?.id ?? `mapped-${idx}-${row.canonical}`,
      symbol: row.canonical,
      message: source?.message ?? null,
      brokerSymbol: row.broker,
    };
  });

  const { data: snapshots } = demoMode
    ? { data: null }
    : await supabase
        .from("chart_live_snapshots")
        .select("display_symbol,broker_symbol,last_price,last_bid,last_ask,last_tick_at,last_candle_at,status,updated_at")
        .eq("user_id", user.id)
        .eq("account_id", activeId)
        .order("updated_at", { ascending: false })
        .limit(50);
  const snapshotByDisplay = new Map<string, Record<string, unknown>>();
  for (const s of snapshots ?? []) {
    const row = s as Record<string, unknown>;
    const displayKey = String(s.display_symbol ?? "").toUpperCase();
    const brokerKey = String(s.broker_symbol ?? "").toUpperCase();
    if (displayKey) snapshotByDisplay.set(displayKey, row);
    if (brokerKey) snapshotByDisplay.set(brokerKey, row);
  }

  const enriched = baseItems.map((item) => {
    const display = cleanDisplaySymbol(item.symbol) || item.symbol.trim().toUpperCase();
    const broker =
      item.brokerSymbol?.trim() ||
      map[display] ||
      resolveBrokerSymbol(display, universe).brokerSymbol ||
      display;
    const symbolReport = report[display];
    const supported =
      demoMode ||
      alpacaMode ||
      Boolean(symbolReport?.resolved) ||
      (Boolean(map[display]) && symbolReport?.resolved !== false) ||
      (universe.length > 0 && universe.some((s) => s === broker));
    const snap =
      snapshotByDisplay.get(display) ??
      snapshotByDisplay.get(String(broker).toUpperCase()) ??
      snapshotByDisplay.get(item.symbol.trim().toUpperCase());
    const demoQuote = demoMode ? getDemoQuotePrice(display) : null;
    const freshness =
      demoQuote != null
        ? new Date().toISOString()
        : (typeof snap?.last_tick_at === "string" ? snap.last_tick_at : null) ??
          (typeof snap?.last_candle_at === "string" ? snap.last_candle_at : null) ??
          symbolReport?.priceTime ??
          null;
    const pricingState = demoQuote
      ? "live"
      : snap
        ? brokerPricingState({
            status: snap.status as string | null,
            updatedAt: snap.updated_at as string | null,
            lastTickAt: snap.last_tick_at as string | null,
            lastCandleAt: snap.last_candle_at as string | null,
          })
        : "warming";
    const bid = demoQuote?.bid ?? (snap?.last_bid != null ? Number(snap.last_bid) : symbolReport?.bid ?? null);
    const ask = demoQuote?.ask ?? (snap?.last_ask != null ? Number(snap.last_ask) : symbolReport?.ask ?? null);
    const spread =
      demoQuote?.spread ??
      (bid != null && ask != null && Number.isFinite(bid) && Number.isFinite(ask)
        ? Math.abs(ask - bid)
        : symbolReport?.spread ?? null);
    return {
      ...item,
      // Show broker name as MT5 does; keep canonical in `displaySymbol` for watchlist identity.
      symbol: mt5Mode ? broker : display,
      displaySymbol: display,
      brokerSymbol: broker,
      runtimePrice: demoQuote?.price ?? (snap?.last_price != null ? Number(snap.last_price) : null),
      bid,
      ask,
      spread,
      freshness,
      runtimeState: demoMode || supported ? pricingState : "unavailable",
      supportLabel: demoMode
        ? "Demo · live ticks"
        : supported
          ? connected
            ? pricingState === "live"
              ? "Live"
              : pricingState === "degraded"
                ? "Degraded"
                : "Supported · no price"
            : "Mapped"
          : universe.length > 0
            ? `Unavailable · ${symbolReport?.reason ?? "not on broker"}`
            : "Resolving",
      supportTone: demoMode || supported ? (pricingState === "live" ? ("live" as const) : ("warm" as const)) : universe.length > 0 ? ("blocked" as const) : ("muted" as const),
    };
  });

  const brokerCatalog = alpacaMode
    ? items
        .map((i) => cleanDisplaySymbol(i.symbol) || i.symbol.toUpperCase())
        .filter((s) => isAlpacaSupportedSymbol(s))
    : universe;

  const visible = enriched.filter((row) => {
    if (demoMode) return true;
    if (alpacaMode) return isAlpacaSupportedSymbol(row.displaySymbol || row.symbol);
    if (universe.length === 0) return true;
    return row.runtimeState !== "unavailable";
  });

  return (
    <WatchlistPageScreen
      items={visible}
      brokerUniverse={brokerCatalog}
      symbolMap={map}
      accountLabel={
        (account?.label as string | null) ??
        (demoMode ? "AXE Demo Account" : alpacaMode ? "AXE Alpaca Paper" : "Active account")
      }
      unavailableSymbols={unavailableNote}
      showSyncWithWatchlist={mt5Mode}
    />
  );
}
