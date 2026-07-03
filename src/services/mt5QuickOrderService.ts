import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getMetadataSymbolMap,
  getMetadataSymbolUniverse,
} from "@/lib/broker/brokerSymbolRuntime";
import { resolveBrokerSymbol } from "@/lib/broker/symbolResolution";
import { getActiveMetaApiCloudAccount } from "@/lib/mt5/activeCloudAccount";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientPlaceOrder,
  MetaApiRequestError,
  type MetaApiOrderType,
  type PlaceOrderInput,
} from "@/lib/mt5/metaApiClient";
import { getTradeExecutionPrefsForUser } from "@/lib/trading/serverTradePrefs";
import {
  MAX_TRADE_VOLUME_LOTS,
  MIN_TRADE_VOLUME_LOTS,
  normalizeTradeVolume,
} from "@/lib/trading/tradeVolume";

export type Mt5QuickOrderResult =
  | { ok: true; message: string; orderId?: string | null; positionId?: string | null }
  | { ok: false; message: string; code?: string };

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

export async function placeMt5QuickOrder(
  supabase: SupabaseClient,
  userId: string,
  args: {
    symbol: string;
    side: "buy" | "sell";
    orderType: "market" | "buy_limit" | "sell_limit";
    volume?: number;
    openPrice?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    comment?: string;
    magic?: number;
  },
): Promise<Mt5QuickOrderResult> {
  if (!getMetaApiToken()) {
    return { ok: false, message: "MetaApi is not configured on this server.", code: "provider_not_configured" };
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
      message: "AXE Demo is virtual — switch to a connected MT5 account to send orders.",
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
      message: "Live trading is off. Enable it in Settings → Live Trading first.",
      code: "live_trading_disabled",
    };
  }

  const prefsVolume = await getTradeExecutionPrefsForUser(userId);
  const volume = normalizeTradeVolume(args.volume ?? prefsVolume.defaultVolume);
  if (volume < MIN_TRADE_VOLUME_LOTS || volume > MAX_TRADE_VOLUME_LOTS) {
    return { ok: false, message: "Volume out of allowed range.", code: "invalid_volume" };
  }

  const metadata =
    accountRow?.metadata && typeof accountRow.metadata === "object" && !Array.isArray(accountRow.metadata)
      ? (accountRow.metadata as Record<string, unknown>)
      : null;

  const displaySymbol = args.symbol.trim().toUpperCase();
  const brokerSymbol = resolveBrokerSymbolForAccount(displaySymbol, metadata);
  const openPrice = args.openPrice ?? null;

  if (args.orderType !== "market") {
    if (openPrice == null || !Number.isFinite(openPrice) || openPrice <= 0) {
      return { ok: false, message: "Pending orders need a valid entry price.", code: "missing_open_price" };
    }
  }

  const input: PlaceOrderInput = {
    accountId: cloud.metaApiAccountId,
    symbol: brokerSymbol,
    actionType: mapActionType(args.side, args.orderType),
    volume,
    openPrice: args.orderType === "market" ? null : openPrice,
    stopLoss: args.stopLoss ?? null,
    takeProfit: args.takeProfit ?? null,
    slippage: 10,
    magic: args.magic ?? 700003,
    comment: args.comment ?? "AXE",
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

    const idHint = result.orderId
      ? ` Order #${result.orderId}.`
      : result.positionId
        ? ` Position #${result.positionId}.`
        : "";

    return {
      ok: true,
      message: `${args.side.toUpperCase()} ${displaySymbol} sent (${result.stringCode ?? "placed"}).${idHint}`,
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
