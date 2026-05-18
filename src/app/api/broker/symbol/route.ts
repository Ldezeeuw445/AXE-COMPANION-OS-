import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getMetadataSymbolMap,
  getMetadataSymbolReport,
  getMetadataSymbolUniverse,
} from "@/lib/broker/brokerSymbolRuntime";
import { cleanDisplaySymbol, resolveBrokerSymbol } from "@/lib/broker/symbolResolution";
import { brokerPricingState } from "@/lib/runtime/runtimeTruth";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const displaySymbol = cleanDisplaySymbol(url.searchParams.get("symbol")) || "";
  if (!displaySymbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const { data: prefs } = await supabase
    .from("user_workspace_preferences")
    .select("active_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const activeId = (prefs?.active_account_id as string | null | undefined) ?? null;
  if (!activeId) {
    return NextResponse.json({
      state: "inactive",
      displaySymbol,
      brokerSymbol: null,
      reason: "Select an active broker account first.",
    });
  }

  const { data: account } = await supabase
    .from("user_broker_accounts")
    .select("id,provider_status,metadata")
    .eq("user_id", user.id)
    .eq("id", activeId)
    .maybeSingle();
  const metadata = (account?.metadata ?? {}) as Record<string, unknown>;
  const map = getMetadataSymbolMap(metadata);
  const report = getMetadataSymbolReport(metadata);
  const universe = getMetadataSymbolUniverse(metadata);
  const cached = map[displaySymbol];
  const resolved = cached ? { brokerSymbol: cached, reason: "cached_match" } : resolveBrokerSymbol(displaySymbol, universe);
  const symbolReport = report[displaySymbol];
  const supported =
    Boolean(symbolReport?.resolved) ||
    (Boolean(cached) && symbolReport?.resolved !== false) ||
    (universe.length > 0 && resolved.reason !== "fallback_request" && universe.includes(resolved.brokerSymbol));

  const { data: snap } = await supabase
    .from("chart_live_snapshots")
    .select("last_price,last_bid,last_ask,last_tick_at,last_candle_at,status,updated_at")
    .eq("user_id", user.id)
    .eq("account_id", activeId)
    .eq("display_symbol", displaySymbol)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const freshness = snap
    ? brokerPricingState({
        status: snap.status as string | null,
        updatedAt: snap.updated_at as string | null,
        lastTickAt: snap.last_tick_at as string | null,
        lastCandleAt: snap.last_candle_at as string | null,
      })
    : "warming";

  if (!supported) {
    return NextResponse.json({
      state: universe.length > 0 ? "unavailable" : "warming",
      displaySymbol,
      brokerSymbol: null,
      reason: symbolReport?.reason ?? "Broker symbol map is still warming.",
      report: symbolReport ?? null,
    });
  }

  return NextResponse.json({
    state: freshness === "live" ? "valid" : "degraded",
    displaySymbol,
    brokerSymbol: cached ?? resolved.brokerSymbol,
    reason: freshness === "live" ? "Broker symbol and fresh price are available." : "Broker symbol is mapped; live price is warming or stale.",
    price: snap?.last_price != null ? Number(snap.last_price) : null,
    freshness,
    report: symbolReport ?? null,
  });
}
