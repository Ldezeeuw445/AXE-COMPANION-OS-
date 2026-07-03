import { WatchlistPageScreen } from "@/components/watchlist/WatchlistPageScreen";
import { listWatchlistItems } from "@/app/(app)/settings/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cleanDisplaySymbol, resolveBrokerSymbol } from "@/lib/broker/symbolResolution";
import { brokerPricingState } from "@/lib/runtime/runtimeTruth";
import { getMetadataSymbolMap, getMetadataSymbolReport, getMetadataSymbolUniverse } from "@/lib/broker/brokerSymbolRuntime";
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

  const { data: snapshots } = demoMode
    ? { data: null }
    : await supabase
        .from("chart_live_snapshots")
        .select("display_symbol,broker_symbol,last_price,last_bid,last_ask,last_tick_at,last_candle_at,status,updated_at")
        .eq("user_id", user.id)
        .eq("account_id", activeId)
        .order("updated_at", { ascending: false })
        .limit(50);
  const snapshotByDisplay = new Map(
    (snapshots ?? []).map((s) => [String(s.display_symbol ?? "").toUpperCase(), s as Record<string, unknown>]),
  );

  const enriched = items.map((item) => {
    const display = cleanDisplaySymbol(item.symbol) || item.symbol.toUpperCase();
    const cached = map[display] ?? map[item.symbol.toUpperCase()];
    const resolved = cached ? { brokerSymbol: cached } : resolveBrokerSymbol(display, universe);
    const symbolReport = report[display];
    const supported =
      Boolean(symbolReport?.resolved) ||
      (Boolean(cached) && symbolReport?.resolved !== false) ||
      (universe.length > 0 && universe.some((s) => s === resolved.brokerSymbol));
    const snap = snapshotByDisplay.get(display);
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
      symbol: display,
      brokerSymbol: resolved.brokerSymbol,
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
    if (alpacaMode) return isAlpacaSupportedSymbol(row.symbol);
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
    />
  );
}
