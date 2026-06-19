import type { SupabaseClient } from "@supabase/supabase-js";
import { chartDeepLink } from "@/lib/feed/feedDeepLinks";
import { recordProactiveFeedEvent } from "@/lib/feed/recordProactiveFeedEvent";
import {
  resolveAlertAutoTradeStops,
} from "@/lib/trading/alertTradeStops";
import { getTradeExecutionPrefsForUser } from "@/lib/trading/serverTradePrefs";
import { placeMt5QuickOrder } from "@/services/mt5QuickOrderService";

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
