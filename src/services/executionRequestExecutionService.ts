import type { SupabaseClient } from "@supabase/supabase-js";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  getMetadataSymbolMap,
  getMetadataSymbolUniverse,
} from "@/lib/broker/brokerSymbolRuntime";
import { resolveBrokerSymbol } from "@/lib/broker/symbolResolution";
import { getActiveMetaApiCloudAccount } from "@/lib/mt5/activeCloudAccount";
import {
  clientPlaceOrder,
  MetaApiRequestError,
  type MetaApiOrderType,
  type PlaceOrderInput,
} from "@/lib/mt5/metaApiClient";

const DEFAULT_VOLUME_LOTS = 0.1;
const MIN_VOLUME_LOTS = 0.01;
const MAX_VOLUME_LOTS = 5;

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

function mapActionType(
  side: "buy" | "sell",
  orderType: "market" | "buy_limit" | "sell_limit",
): MetaApiOrderType {
  if (orderType === "market") return side === "buy" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL";
  return side === "buy" ? "ORDER_TYPE_BUY_LIMIT" : "ORDER_TYPE_SELL_LIMIT";
}

function isSuccessfulRetcode(stringCode: string | undefined): boolean {
  if (!stringCode) return false;
  return (
    stringCode === "TRADE_RETCODE_DONE" ||
    stringCode === "TRADE_RETCODE_DONE_PARTIAL" ||
    stringCode === "TRADE_RETCODE_PLACED"
  );
}

function resolveBrokerSymbolForAccount(
  displaySymbol: string,
  metadata: Record<string, unknown> | null,
): string {
  const upper = displaySymbol.trim().toUpperCase();
  const map = getMetadataSymbolMap(metadata);
  if (map[upper]) return map[upper];
  const universe = getMetadataSymbolUniverse(metadata);
  return resolveBrokerSymbol(upper, universe).brokerSymbol || upper;
}

export async function executeExecutionRequestOnMt5(
  supabase: SupabaseClient,
  userId: string,
  executionRequestId: string,
): Promise<ExecuteExecutionRequestResult> {
  if (!getMetaApiToken()) {
    return {
      ok: false,
      message: "MetaApi is not configured on this server.",
      code: "provider_not_configured",
    };
  }

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

  const cloud = await getActiveMetaApiCloudAccount(supabase, userId);
  if (!cloud) {
    return {
      ok: false,
      message: "No connected MT5 cloud account. Link one under Accounts and set it active.",
      code: "account_not_connected",
    };
  }

  const { data: accountRow } = await supabase
    .from("user_broker_accounts")
    .select("connection_method,provider,metadata")
    .eq("id", cloud.brokerAccountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (accountRow?.connection_method === "demo_paper" || accountRow?.provider === "demo") {
    return {
      ok: false,
      message: "AXE Demo is virtual — switch to a connected MT5 account to send this order.",
      code: "demo_account",
    };
  }

  const { data: prefs, error: prefsErr } = await supabase
    .from("user_workspace_preferences")
    .select("live_trading_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (prefsErr) return { ok: false, message: prefsErr.message, code: "prefs_lookup_failed" };
  if (!prefs?.live_trading_enabled) {
    return {
      ok: false,
      message: "Live trading is off. Enable it in Settings → Live Trading before AXE can send broker orders.",
      code: "live_trading_disabled",
    };
  }

  const metadata =
    accountRow?.metadata && typeof accountRow.metadata === "object" && !Array.isArray(accountRow.metadata)
      ? (accountRow.metadata as Record<string, unknown>)
      : null;

  const displaySymbol = (exec.symbol ?? exec.instrument).trim().toUpperCase();
  const brokerSymbol = resolveBrokerSymbolForAccount(displaySymbol, metadata);
  const entryPrice = exec.entry_price != null ? Number(exec.entry_price) : null;
  const stopLoss = exec.stop_loss != null ? Number(exec.stop_loss) : null;
  const takeProfit = exec.take_profit != null ? Number(exec.take_profit) : null;
  const { side, orderType } = mapOrderType(direction, entryPrice);
  const volume = DEFAULT_VOLUME_LOTS;

  if (volume < MIN_VOLUME_LOTS || volume > MAX_VOLUME_LOTS) {
    return { ok: false, message: "Volume out of allowed range.", code: "invalid_volume" };
  }
  if (orderType !== "market" && (entryPrice == null || !Number.isFinite(entryPrice) || entryPrice <= 0)) {
    return { ok: false, message: "Pending orders need a valid entry price.", code: "missing_open_price" };
  }

  const input: PlaceOrderInput = {
    accountId: cloud.metaApiAccountId,
    symbol: brokerSymbol,
    actionType: mapActionType(side, orderType),
    volume,
    openPrice: orderType === "market" ? null : entryPrice,
    stopLoss: stopLoss != null && Number.isFinite(stopLoss) && stopLoss > 0 ? stopLoss : null,
    takeProfit: takeProfit != null && Number.isFinite(takeProfit) && takeProfit > 0 ? takeProfit : null,
    slippage: 10,
    magic: 700002,
    comment: "AXE draft",
    region: cloud.metaApiRegion,
  };

  try {
    const result = await clientPlaceOrder(input);
    const ok = isSuccessfulRetcode(result.stringCode);
    if (!ok) {
      return {
        ok: false,
        message: result.message ?? result.stringCode ?? "Broker rejected the order.",
        code: "broker_rejected",
      };
    }

    const orderNote = [
      exec.notes,
      `mt5_order_id:${result.orderId ?? ""}`,
      `mt5_position_id:${result.positionId ?? ""}`,
      `retcode:${result.stringCode ?? ""}`,
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

    if (updateErr) {
      return {
        ok: true,
        message: `Order sent (${result.stringCode}) but status save failed — check MT5.`,
        orderId: result.orderId ?? null,
        positionId: result.positionId ?? null,
      };
    }

    await supabase.from("axe_proactive_events").insert({
      user_id: userId,
      event_key: `exec_placed:${executionRequestId}`,
      title: `Order placed: ${displaySymbol}`,
      body: `${direction.toUpperCase()} ${volume} lots — ${orderType === "market" ? "market" : `limit @ ${entryPrice}`}`,
      url: "/positions",
    });

    const idHint = result.orderId
      ? ` Order #${result.orderId}.`
      : result.positionId
        ? ` Position #${result.positionId}.`
        : "";

    return {
      ok: true,
      message: `${side.toUpperCase()} ${displaySymbol} sent to MT5 (${result.stringCode ?? "placed"}).${idHint}`,
      orderId: result.orderId ?? null,
      positionId: result.positionId ?? null,
    };
  } catch (e) {
    if (e instanceof MetaApiRequestError) {
      return { ok: false, message: e.message, code: e.code };
    }
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not place order on MT5.",
      code: "unknown",
    };
  }
}
