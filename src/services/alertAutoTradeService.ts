import type { SupabaseClient } from "@supabase/supabase-js";
import { chartDeepLink } from "@/lib/feed/feedDeepLinks";
import { recordProactiveFeedEvent } from "@/lib/feed/recordProactiveFeedEvent";
import {
  resolveAlertAutoTradeStops,
} from "@/lib/trading/alertTradeStops";
import { readAlertAutoTradeEnabled } from "@/lib/trading/alertMetadata";
import { evaluateAlertTradeGate } from "@/lib/trading/alertAutoTrade";
import { isAlertAutoTradeArmed } from "@/lib/trading/alertAutoTradeArmed";
import { getTradeExecutionPrefsForUser } from "@/lib/trading/serverTradePrefs";
import { placeMt5QuickOrder } from "@/services/mt5QuickOrderService";
import { decideAutoTradeAllowed } from "@/services/tradeGuardService";

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

  // One question instead of three, and it names the switch that is off. These
  // used to be three separate early returns, two of them silent — so a trader
  // who had set autonomy to level 3 and left the alert channel off saw an
  // alert fire and nothing happen, with nothing anywhere saying why. See
  // `alertAutoTrade.ts`; the gates themselves are unchanged and still ANDed.
  const gate = evaluateAlertTradeGate({
    autonomy: prefs.autonomy,
    channelEnabled: prefs.alertAutoTradeEnabled,
    alertEnabled: readAlertAutoTradeEnabled(alert.metadata, true),
    armed: isAlertAutoTradeArmed(prefs.alertAutoTradeArmedAt),
  });

  if (!gate.ready) {
    // "alert_off" stays quiet: the trader switched this one alert off on
    // purpose and does not need a feed entry every time it fires. The other
    // three are a surprise worth explaining — including the two that said
    // nothing at all before.
    if (gate.blocker !== "alert_off") {
      await recordProactiveFeedEvent(
        supabase,
        userId,
        `alert_trade_blocked:${alert.id}:${Date.now()}`,
        `Alert auto-trade blocked: ${alert.symbol}`,
        gate.detail,
        gate.href ?? "/alerts",
      );
    }
    return { traded: false, message: gate.detail };
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
  const guardDecision = await decideAutoTradeAllowed(
    supabase,
    userId,
    symbol,
    prefs.defaultVolume,
    false,
    // Entry and stop are both known here, so a risk-per-trade cap is
    // enforceable on this path rather than only refusable.
    { entryPrice: entry, stopLoss: stops.stopLoss },
  );
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

