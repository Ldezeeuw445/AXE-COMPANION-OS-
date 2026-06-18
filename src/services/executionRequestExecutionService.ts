import type { SupabaseClient } from "@supabase/supabase-js";
import { recordProactiveFeedEvent } from "@/lib/feed/recordProactiveFeedEvent";
import { placeMt5QuickOrder } from "@/services/mt5QuickOrderService";

export type ExecuteExecutionRequestResult =
  | { ok: true; message: string; orderId?: string | null; positionId?: string | null }
  | { ok: false; message: string; code?: string };

type ExecutionRow = {
  id: string;
  instrument: string;
  symbol: string | null;
  direction: string | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: string;
  notes: string | null;
};

function mapOrderType(
  direction: string,
  entryPrice: number | null,
): { side: "buy" | "sell"; orderType: "market" | "buy_limit" | "sell_limit" } {
  const isLong = direction === "long";
  const side = isLong ? "buy" : "sell";
  if (entryPrice != null && Number.isFinite(entryPrice) && entryPrice > 0) {
    return { side, orderType: isLong ? "buy_limit" : "sell_limit" };
  }
  return { side, orderType: "market" };
}

export async function executeExecutionRequestOnMt5(
  supabase: SupabaseClient,
  userId: string,
  executionRequestId: string,
): Promise<ExecuteExecutionRequestResult> {
  const { data: row, error: rowErr } = await supabase
    .from("execution_requests")
    .select("id,instrument,symbol,direction,entry_price,stop_loss,take_profit,status,notes")
    .eq("id", executionRequestId)
    .eq("user_id", userId)
    .maybeSingle();

  if (rowErr) return { ok: false, message: rowErr.message, code: "lookup_failed" };
  if (!row) return { ok: false, message: "Trade draft not found.", code: "not_found" };

  const exec = row as ExecutionRow;
  if (!["pending", "pending_approval", "draft"].includes(exec.status)) {
    return { ok: false, message: "This draft was already handled.", code: "invalid_status" };
  }

  const direction = exec.direction ?? "long";
  if (direction !== "long" && direction !== "short") {
    return { ok: false, message: "Direction must be long or short to place on MT5.", code: "invalid_direction" };
  }

  const displaySymbol = (exec.symbol ?? exec.instrument).trim().toUpperCase();
  const entryPrice = exec.entry_price != null ? Number(exec.entry_price) : null;
  const stopLoss = exec.stop_loss != null ? Number(exec.stop_loss) : null;
  const takeProfit = exec.take_profit != null ? Number(exec.take_profit) : null;
  const { side, orderType } = mapOrderType(direction, entryPrice);

  const placed = await placeMt5QuickOrder(supabase, userId, {
    symbol: displaySymbol,
    side,
    orderType,
    openPrice: orderType === "market" ? null : entryPrice,
    stopLoss: stopLoss != null && Number.isFinite(stopLoss) && stopLoss > 0 ? stopLoss : null,
    takeProfit: takeProfit != null && Number.isFinite(takeProfit) && takeProfit > 0 ? takeProfit : null,
    comment: "AXE draft",
    magic: 700002,
  });

  if (!placed.ok) {
    return { ok: false, message: placed.message, code: placed.code };
  }

  const orderNote = [
    exec.notes,
    `mt5_order_id:${placed.orderId ?? ""}`,
    `mt5_position_id:${placed.positionId ?? ""}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const { error: updateErr } = await supabase
    .from("execution_requests")
    .update({
      status: "executed",
      notes: orderNote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", executionRequestId)
    .eq("user_id", userId);

  await recordProactiveFeedEvent(
    supabase,
    userId,
    `exec_placed:${executionRequestId}`,
    `Order placed: ${displaySymbol}`,
    `${direction.toUpperCase()} — ${orderType === "market" ? "market" : `limit @ ${entryPrice}`}`,
    "/positions",
  );

  if (updateErr) {
    return {
      ok: true,
      message: `${placed.message} Status save failed — check MT5.`,
      orderId: placed.orderId ?? null,
      positionId: placed.positionId ?? null,
    };
  }

  return {
    ok: true,
    message: placed.message,
    orderId: placed.orderId ?? null,
    positionId: placed.positionId ?? null,
  };
}
