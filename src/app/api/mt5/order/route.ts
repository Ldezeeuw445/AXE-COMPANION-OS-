import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientPlaceOrder,
  MetaApiRequestError,
  type MetaApiOrderType,
  type PlaceOrderInput,
} from "@/lib/mt5/metaApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated MT5 order placement.
 *
 * Layered guards (in order):
 *   1. Supabase auth — anonymous requests are rejected.
 *   2. MetaApi configured — without a token nothing goes anywhere.
 *   3. Body validation — symbol / volume / actionType + numeric sanity.
 *   4. Account ownership — the broker_account row must belong to this user.
 *   5. Demo refusal — AXE Demo Account never receives a real broker order.
 *   6. MetaApi link required — only `cloud_mt5` accounts with an external id.
 *   7. Volume cap — server-side ceiling so a UI bug can't send 100 lots.
 *
 * The client is also responsible for the live-trading flag + final-confirm
 * modal, but those are UX safeguards. This route is the security layer.
 */

type OrderBody = {
  brokerAccountId: string;
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop";
  /** Lots, e.g. 0.10. */
  volume: number;
  openPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  /** Slippage in points. */
  slippage?: number | null;
  comment?: string | null;
};

const MAX_VOLUME_LOTS = 5;
const MIN_VOLUME_LOTS = 0.01;

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return errJson(503, "supabase_not_configured", "Supabase is not configured.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errJson(401, "unauthorized", "Sign in to place orders.");

  if (!getMetaApiToken()) {
    return errJson(503, "provider_not_configured", "MetaApi token is not configured on this server.");
  }

  let body: OrderBody;
  try {
    body = (await request.json()) as OrderBody;
  } catch {
    return errJson(400, "invalid_body", "Order payload must be JSON.");
  }

  const {
    brokerAccountId,
    symbol,
    side,
    orderType,
    volume,
    openPrice,
    stopLoss,
    takeProfit,
    slippage,
    comment,
  } = body ?? {};

  if (typeof brokerAccountId !== "string" || !brokerAccountId) {
    return errJson(400, "missing_account", "brokerAccountId is required.");
  }
  if (typeof symbol !== "string" || symbol.trim().length === 0) {
    return errJson(400, "missing_symbol", "symbol is required.");
  }
  if (side !== "buy" && side !== "sell") {
    return errJson(400, "invalid_side", "side must be 'buy' or 'sell'.");
  }
  if (
    orderType !== "market" &&
    orderType !== "buy_limit" &&
    orderType !== "sell_limit" &&
    orderType !== "buy_stop" &&
    orderType !== "sell_stop"
  ) {
    return errJson(400, "invalid_order_type", "orderType must be market/buy_limit/sell_limit/buy_stop/sell_stop.");
  }
  if (typeof volume !== "number" || !Number.isFinite(volume) || volume < MIN_VOLUME_LOTS || volume > MAX_VOLUME_LOTS) {
    return errJson(400, "invalid_volume", `volume must be between ${MIN_VOLUME_LOTS} and ${MAX_VOLUME_LOTS} lots.`);
  }
  if (orderType !== "market") {
    if (typeof openPrice !== "number" || !Number.isFinite(openPrice) || openPrice <= 0) {
      return errJson(400, "missing_open_price", "Pending orders require a valid openPrice.");
    }
  }
  if (stopLoss != null && (!Number.isFinite(stopLoss) || stopLoss <= 0)) {
    return errJson(400, "invalid_sl", "stopLoss must be a positive number.");
  }
  if (takeProfit != null && (!Number.isFinite(takeProfit) || takeProfit <= 0)) {
    return errJson(400, "invalid_tp", "takeProfit must be a positive number.");
  }

  const { data: account, error: accountErr } = await supabase
    .from("user_broker_accounts")
    .select("id,user_id,connection_method,external_connection_id,provider")
    .eq("id", brokerAccountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountErr) return errJson(500, "account_lookup_failed", accountErr.message);
  if (!account) return errJson(404, "account_not_found", "That broker account is not on your workspace.");

  if (account.connection_method === "demo_paper" || account.provider === "demo") {
    return errJson(
      409,
      "demo_account",
      "AXE Demo Account is virtual — paper trades never reach a broker. Switch to a connected MT5 account to send live orders.",
    );
  }

  if (account.connection_method !== "cloud_mt5" || !account.external_connection_id) {
    return errJson(
      409,
      "account_not_connected",
      "This account is not linked to MetaApi. Connect it from /accounts before sending live orders.",
    );
  }

  const actionType: MetaApiOrderType = mapActionType(side, orderType);
  const input: PlaceOrderInput = {
    accountId: account.external_connection_id,
    symbol: symbol.trim(),
    actionType,
    volume,
    openPrice: orderType === "market" ? null : openPrice ?? null,
    stopLoss: stopLoss ?? null,
    takeProfit: takeProfit ?? null,
    slippage: slippage ?? null,
    magic: 700001,
    comment: comment ?? "AXE",
  };

  try {
    const result = await clientPlaceOrder(input);
    const ok = isSuccessfulRetcode(result.stringCode);
    return Response.json(
      {
        ok,
        stringCode: result.stringCode ?? null,
        numericCode: result.numericCode ?? null,
        message: result.message ?? null,
        orderId: result.orderId ?? null,
        positionId: result.positionId ?? null,
        raw: result.raw,
      },
      { status: ok ? 200 : 422 },
    );
  } catch (e) {
    if (e instanceof MetaApiRequestError) {
      return errJson(502, e.code, e.message, { payload: e.payload });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return errJson(500, "unknown", message);
  }
}

function mapActionType(side: "buy" | "sell", type: OrderBody["orderType"]): MetaApiOrderType {
  if (type === "market") return side === "buy" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL";
  if (type === "buy_limit") return "ORDER_TYPE_BUY_LIMIT";
  if (type === "sell_limit") return "ORDER_TYPE_SELL_LIMIT";
  if (type === "buy_stop") return "ORDER_TYPE_BUY_STOP";
  return "ORDER_TYPE_SELL_STOP";
}

function isSuccessfulRetcode(stringCode: string | undefined): boolean {
  if (!stringCode) return false;
  // MT5 success retcodes — anything else is a partial / rejection / error.
  return (
    stringCode === "TRADE_RETCODE_DONE" ||
    stringCode === "TRADE_RETCODE_DONE_PARTIAL" ||
    stringCode === "TRADE_RETCODE_PLACED"
  );
}

function errJson(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, code, message, ...extra }, { status });
}
