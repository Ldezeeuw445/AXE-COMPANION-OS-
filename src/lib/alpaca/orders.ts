import type { CreateAlpacaOrderInput } from "@/lib/alpaca/client";

export type AxeMt5OrderType =
  | "market"
  | "buy_limit"
  | "sell_limit"
  | "buy_stop"
  | "sell_stop";

export type AlpacaOrderRequest = {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  type: "market" | "limit" | "stop" | "stop_limit";
  limit_price?: number;
  stop_price?: number;
  time_in_force?: "day" | "gtc";
  order_class?: "simple" | "bracket" | "oco" | "oto";
  take_profit?: { limit_price: number };
  stop_loss?: { stop_price: number; limit_price?: number };
  client_order_id?: string;
};

/** AXE chart "lots" on Alpaca paper map 1:1 to fractional share qty. */
export function alpacaQtyFromAxeVolume(volume: number): number {
  const qty = Number(volume);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return Math.round(qty * 10000) / 10000;
}

export function mapAxeOrderTypeToAlpaca(
  orderType: AxeMt5OrderType,
  side: "buy" | "sell",
): Pick<AlpacaOrderRequest, "type" | "side"> {
  switch (orderType) {
    case "market":
      return { type: "market", side };
    case "buy_limit":
      return { type: "limit", side: "buy" };
    case "sell_limit":
      return { type: "limit", side: "sell" };
    case "buy_stop":
      return { type: "stop", side: "buy" };
    case "sell_stop":
      return { type: "stop", side: "sell" };
  }
}

export function buildAlpacaOrderPayload(input: {
  symbol: string;
  side: "buy" | "sell";
  orderType: AxeMt5OrderType;
  volume: number;
  openPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  clientOrderId?: string;
}): CreateAlpacaOrderInput & {
  order_class?: string;
  take_profit?: { limit_price: number };
  stop_loss?: { stop_price: number; limit_price?: number };
} {
  const qty = alpacaQtyFromAxeVolume(input.volume);
  if (qty <= 0) throw new Error("Volume must be greater than zero.");

  const mapped = mapAxeOrderTypeToAlpaca(input.orderType, input.side);
  const isMarket = mapped.type === "market";
  const limitPrice = mapped.type === "limit" ? input.openPrice : undefined;
  const stopPrice = mapped.type === "stop" ? input.openPrice : undefined;

  if (!isMarket && (limitPrice == null || !Number.isFinite(limitPrice) || limitPrice <= 0)) {
    throw new Error("Pending orders require a valid limit/stop price.");
  }

  const hasBracket =
    !isMarket &&
    input.stopLoss != null &&
    Number.isFinite(input.stopLoss) &&
    input.stopLoss > 0 &&
    input.takeProfit != null &&
    Number.isFinite(input.takeProfit) &&
    input.takeProfit > 0;

  const base: CreateAlpacaOrderInput & {
    order_class?: string;
    take_profit?: { limit_price: number };
    stop_loss?: { stop_price: number; limit_price?: number };
  } = {
    symbol: input.symbol,
    qty,
    side: mapped.side,
    type: mapped.type,
    time_in_force: isMarket ? "day" : "gtc",
    limit_price: limitPrice ?? undefined,
    stop_price: stopPrice ?? undefined,
    client_order_id: input.clientOrderId,
  };

  if (hasBracket) {
    base.order_class = "bracket";
    base.take_profit = { limit_price: input.takeProfit! };
    base.stop_loss = { stop_price: input.stopLoss! };
  }

  return base;
}
