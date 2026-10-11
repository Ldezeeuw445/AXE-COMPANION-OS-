import type { SupabaseClient } from "@supabase/supabase-js";
import { chartDeepLink } from "@/lib/feed/feedDeepLinks";
import { recordProactiveFeedEvent } from "@/lib/feed/recordProactiveFeedEvent";
import {
  resolveAlertAutoTradeStops,
} from "@/lib/trading/alertTradeStops";
import { readAlertAutoTradeEnabled } from "@/lib/trading/alertMetadata";
import { isAlertAutoTradeArmed } from "@/lib/trading/alertAutoTradeArmed";
import { getTradeExecutionPrefsForUser } from "@/lib/trading/serverTradePrefs";
import { placeMt5QuickOrder } from "@/services/mt5QuickOrderService";
import { buildAccountProfile } from "@/lib/risk/accountProfile";
import { evaluateAutoTrade } from "@/lib/trading/autoTradeGuard";
import { buildMarketContext } from "@/lib/market/marketContextService";

export async function maybeAutoTradeOnAlert(
  supabase: SupabaseClient,
  userId: string,
  alert: {
    id: string;
    symbol: string | null;
    type: string;
    condition: string | null;
    threshold: number | null;
    metadata?: unknown;
  },
  triggerPrice: number | null,
): Promise<{ traded: boolean; message?: string }> {
  if (alert.type !== "price" || !alert.symbol) return { traded: false };
  if (alert.condition !== "above" && alert.condition !== "below") return { traded: false };

  const prefs = await getTradeExecutionPrefsForUser(userId);
  if (!prefs.alertAutoTradeEnabled) return { traded: false };

  if (!readAlertAutoTradeEnabled(alert.metadata, true)) {
    return { traded: false, message: "Auto-trade off for this alert." };
  }

  if (!isAlertAutoTradeArmed(prefs.alertAutoTradeArmedAt)) {
    await recordProactiveFeedEvent(
      supabase,
      userId,
      `alert_trade_blocked:${alert.id}:${Date.now()}`,
      `Alert auto-trade blocked: ${alert.symbol}`,
      "Auto-trade is not armed — tap Arm on Alerts before the next fire.",
      "/alerts",
    );
    return { traded: false, message: "Alert auto-trade not armed." };
  }

  const entry =
    triggerPrice != null && Number.isFinite(triggerPrice)
      ? triggerPrice
      : alert.threshold != null && Number.isFinite(Number(alert.threshold))
        ? Number(alert.threshold)
        : null;

  if (entry == null) {
    await recordProactiveFeedEvent(
      supabase,
      userId,
      `alert_trade_failed:${alert.id}:${Date.now()}`,
      `Alert auto-trade blocked: ${alert.symbol}`,
      "No trigger price — cannot place order with SL/TP.",
      "/alerts",
    );
    return { traded: false, message: "No trigger price." };
  }

  const stops = resolveAlertAutoTradeStops({
    condition: alert.condition,
    triggerPrice: entry,
    metadata: alert.metadata,
    slOffset: prefs.alertSlOffset,
    tpOffset: prefs.alertTpOffset,
  });

  if ("error" in stops) {
    await recordProactiveFeedEvent(
      supabase,
      userId,
      `alert_trade_failed:${alert.id}:${Date.now()}`,
      `Alert auto-trade blocked: ${alert.symbol}`,
      stops.error,
      "/alerts",
    );
    return { traded: false, message: stops.error };
  }

  const side = stops.tradeSide;

  const symbol = alert.symbol.trim().toUpperCase();

  /* ── Is this trade allowed right now? ─────────────────────────────
     The three consent layers above answer "did the trader agree?".
     This answers "do this account's rules permit it?" — a different
     question, and the one that was never asked. Until this guard
     existed, AXE could warn a funded trader off red news and then
     place a market order into the same event. */
  const guardDecision = await decideAutoTradeAllowed(supabase, userId, symbol, prefs.defaultVolume);
  if (!guardDecision.allowed) {
    await recordProactiveFeedEvent(
      supabase,
      userId,
      `alert_trade_blocked:${alert.id}:${guardDecision.reason}:${new Date().toISOString().slice(0, 10)}`,
      `Alert auto-trade blocked: ${symbol}`,
      guardDecision.detail,
      "/alerts",
    );
    return { traded: false, message: guardDecision.detail };
  }

  const placed = await placeMt5QuickOrder(supabase, userId, {
    symbol,
    side,
    orderType: "market",
    stopLoss: stops.stopLoss,
    takeProfit: stops.takeProfit,
    comment: `AXE alert ${alert.id.slice(0, 8)}`,
    magic: 700004,
  });

  const priceText = ` @ ${entry}`;
  const riskText = ` SL ${stops.stopLoss} · TP ${stops.takeProfit}`;

  if (placed.ok) {
    await recordProactiveFeedEvent(
      supabase,
      userId,
      `alert_trade:${alert.id}:${Date.now()}`,
      `Alert auto-trade: ${symbol}`,
      `${side.toUpperCase()} ${prefs.defaultVolume} lots${priceText}${riskText} — ${placed.message}`,
      chartDeepLink(symbol),
    );
    return { traded: true, message: placed.message };
  }

  await recordProactiveFeedEvent(
    supabase,
    userId,
    `alert_trade_failed:${alert.id}:${Date.now()}`,
    `Alert auto-trade failed: ${symbol}`,
    placed.message,
    "/alerts",
  );

  return { traded: false, message: placed.message };
}

/**
 * Gather what the guard needs and ask it. Kept beside the caller rather than
 * inside the pure guard so the decision logic stays testable without a
 * database.
 *
 * Anything we cannot measure is passed as null and the guard treats it as
 * "unknown", never as "fine" — but a missing account row is a hard stop: we
 * will not place an automated order on an account whose rules we cannot read.
 */
async function decideAutoTradeAllowed(
  supabase: SupabaseClient,
  userId: string,
  symbol: string,
  volumeLots: number,
): Promise<{ allowed: true } | { allowed: false; reason: string; detail: string }> {
  const { data: prefsRow } = await supabase
    .from("user_workspace_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  const accountId = (prefsRow?.active_account_id as string | null) ?? null;

  const { data: account } = accountId
    ? await supabase
        .from("user_broker_accounts")
        .select("label,mt5_server,metadata,connection_method")
        .eq("user_id", userId)
        .eq("id", accountId)
        .maybeSingle()
    : { data: null };

  if (!account) {
    return {
      allowed: false,
      reason: "no_account",
      detail:
        "Not placed: AXE could not read this account's trading rules, so it will not place an order on your behalf.",
    };
  }

  const profile = buildAccountProfile({
    label: (account.label as string | null) ?? null,
    mt5Server: (account.mt5_server as string | null) ?? null,
    metadata: (account.metadata as Record<string, unknown> | null) ?? null,
    connectionMethod: (account.connection_method as string | null) ?? null,
  });

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [positionsRes, todayTradesRes, snapshotRes] = await Promise.all([
    supabase.from("mt5_positions").select("id").eq("user_id", userId).eq("account_id", accountId),
    supabase
      .from("broker_trades")
      .select("pnl")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .gte("close_time", dayStart.toISOString()),
    supabase
      .from("mt5_account_snapshots")
      .select("balance")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const todayTrades = (todayTradesRes.data ?? []) as Array<{ pnl: number | null }>;
  const realisedToday = todayTrades.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
  const balance = Number((snapshotRes.data as { balance?: unknown } | null)?.balance ?? NaN);
  const dayResultPct =
    Number.isFinite(balance) && balance > 0 ? (realisedToday / balance) * 100 : null;

  // Automated trades AXE placed today, counted from the feed events it writes.
  const { count: autoTradesToday } = await supabase
    .from("axe_proactive_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .like("event_key", "alert_trade:%")
    .gte("created_at", dayStart.toISOString());

  let minutesToHighImpact: number | null = null;
  try {
    const market = await buildMarketContext({ symbol, watchlist: [symbol], newsLimit: 2, calendarLimit: 8 });
    for (const event of market.events ?? []) {
      if (event.impact !== "high") continue;
      const delta = (new Date(event.startsAt).getTime() - Date.now()) / 60000;
      if (delta < -45 || delta > 90) continue;
      if (minutesToHighImpact === null || Math.abs(delta) < Math.abs(minutesToHighImpact)) {
        minutesToHighImpact = delta;
      }
    }
  } catch {
    // Calendar unavailable. Left as null: the guard treats that as unknown,
    // and a news rule cannot be enforced on data we do not have.
  }

  return evaluateAutoTrade({
    profile,
    volumeLots,
    openPositions: positionsRes.data?.length ?? 0,
    autoTradesToday: autoTradesToday ?? 0,
    dayResultPct,
    minutesToHighImpact,
    now: new Date(),
  });
}
