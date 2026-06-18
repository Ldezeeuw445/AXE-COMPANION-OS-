import type { SupabaseClient } from "@supabase/supabase-js";
import { recordProactiveFeedEvent } from "@/lib/feed/recordProactiveFeedEvent";
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
  },
  triggerPrice: number | null,
): Promise<{ traded: boolean; message?: string }> {
  if (alert.type !== "price" || !alert.symbol) return { traded: false };
  if (alert.condition !== "above" && alert.condition !== "below") return { traded: false };

  const prefs = await getTradeExecutionPrefsForUser(userId);
  if (!prefs.alertAutoTradeEnabled) return { traded: false };

  const side = alert.condition === "above" ? "buy" : "sell";
  const symbol = alert.symbol.trim().toUpperCase();

  const placed = await placeMt5QuickOrder(supabase, userId, {
    symbol,
    side,
    orderType: "market",
    comment: `AXE alert ${alert.id.slice(0, 8)}`,
    magic: 700004,
  });

  const priceText = triggerPrice != null && Number.isFinite(triggerPrice) ? ` @ ${triggerPrice}` : "";

  if (placed.ok) {
    await recordProactiveFeedEvent(
      supabase,
      userId,
      `alert_trade:${alert.id}:${Date.now()}`,
      `Alert auto-trade: ${symbol}`,
      `${side.toUpperCase()} ${prefs.defaultVolume} lots${priceText} — ${placed.message}`,
      "/positions",
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
