export type AlertTradeSide = "buy" | "sell";

export function parseOptionalPrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Validate SL/TP price levels relative to entry for the chosen trade side. */
export function validateAlertTradeStops(
  side: AlertTradeSide,
  entry: number,
  stopLoss: number,
  takeProfit: number,
): string | null {
  if (!Number.isFinite(entry) || entry <= 0) return "Invalid entry price.";
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) return "Stop loss must be a positive price.";
  if (!Number.isFinite(takeProfit) || takeProfit <= 0) return "Take profit must be a positive price.";

  if (side === "buy") {
    if (stopLoss >= entry) return "Buy: stop loss price must be below entry.";
    if (takeProfit <= entry) return "Buy: take profit price must be above entry.";
  } else {
    if (stopLoss <= entry) return "Sell: stop loss price must be above entry.";
    if (takeProfit >= entry) return "Sell: take profit price must be below entry.";
  }
  return null;
}

/** Legacy mapping — only used when metadata has no explicit trade_side. */
export function sideForAlertCondition(condition: string | null): AlertTradeSide | null {
  if (condition === "above") return "buy";
  if (condition === "below") return "sell";
  return null;
}

export function readTradeSideFromMetadata(
  metadata: unknown,
  condition: string | null,
): AlertTradeSide | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const raw = (metadata as Record<string, unknown>).trade_side;
    if (raw === "buy" || raw === "sell") return raw;
  }
  return sideForAlertCondition(condition);
}

export function describeAlertTrigger(condition: string | null, threshold: number | null): string {
  const level = threshold != null && Number.isFinite(threshold) ? String(threshold) : "—";
  if (condition === "below") return `Fires when price drops to ${level}`;
  if (condition === "above") return `Fires when price rises to ${level}`;
  return "Price alert";
}

export function slTpHints(side: AlertTradeSide, entry: number | null): {
  stopLossPlaceholder: string;
  takeProfitPlaceholder: string;
  summary: string;
} {
  if (side === "buy") {
    return {
      stopLossPlaceholder: entry != null ? `e.g. ${(entry - 10).toFixed(2)}` : "below entry price",
      takeProfitPlaceholder: entry != null ? `e.g. ${(entry + 15).toFixed(2)}` : "above entry price",
      summary: "Buy: SL price below entry · TP price above entry.",
    };
  }
  return {
    stopLossPlaceholder: entry != null ? `e.g. ${(entry + 10).toFixed(2)}` : "above entry price",
    takeProfitPlaceholder: entry != null ? `e.g. ${(entry - 15).toFixed(2)}` : "below entry price",
    summary: "Sell: SL price above entry · TP price below entry.",
  };
}

/** Suggest SL/TP prices from entry + workspace offsets. */
export function suggestAlertStopsFromOffsets(
  tradeSide: AlertTradeSide | null,
  threshold: number,
  slOffset: number | null,
  tpOffset: number | null,
): { stopLoss: number | null; takeProfit: number | null } {
  if (slOffset == null || tpOffset == null || !Number.isFinite(threshold)) {
    return { stopLoss: null, takeProfit: null };
  }
  if (slOffset <= 0 || tpOffset <= 0) return { stopLoss: null, takeProfit: null };

  if (tradeSide === "buy") {
    return { stopLoss: threshold - slOffset, takeProfit: threshold + tpOffset };
  }
  if (tradeSide === "sell") {
    return { stopLoss: threshold + slOffset, takeProfit: threshold - tpOffset };
  }
  return { stopLoss: null, takeProfit: null };
}

export function readAlertStopsFromMetadata(metadata: unknown): {
  stopLoss: number | null;
  takeProfit: number | null;
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { stopLoss: null, takeProfit: null };
  }
  const m = metadata as Record<string, unknown>;
  const sl = m.stop_loss != null ? Number(m.stop_loss) : null;
  const tp = m.take_profit != null ? Number(m.take_profit) : null;
  return {
    stopLoss: sl != null && Number.isFinite(sl) && sl > 0 ? sl : null,
    takeProfit: tp != null && Number.isFinite(tp) && tp > 0 ? tp : null,
  };
}

export function resolveAlertAutoTradeStops(args: {
  condition: string | null;
  triggerPrice: number;
  metadata: unknown;
  slOffset: number | null;
  tpOffset: number | null;
}): { stopLoss: number; takeProfit: number; tradeSide: AlertTradeSide } | { error: string } {
  const tradeSide = readTradeSideFromMetadata(args.metadata, args.condition);
  if (!tradeSide) {
    return { error: "Alert auto-trade blocked — set trade direction (buy or sell) on the alert." };
  }

  const fromMeta = readAlertStopsFromMetadata(args.metadata);
  let stopLoss = fromMeta.stopLoss;
  let takeProfit = fromMeta.takeProfit;

  if (stopLoss == null || takeProfit == null) {
    const suggested = suggestAlertStopsFromOffsets(
      tradeSide,
      args.triggerPrice,
      args.slOffset,
      args.tpOffset,
    );
    stopLoss = stopLoss ?? suggested.stopLoss;
    takeProfit = takeProfit ?? suggested.takeProfit;
  }

  if (stopLoss == null || takeProfit == null) {
    return { error: "Alert auto-trade blocked — set stop loss and take profit prices on the alert." };
  }

  const validation = validateAlertTradeStops(tradeSide, args.triggerPrice, stopLoss, takeProfit);
  if (validation) return { error: validation };

  return { stopLoss, takeProfit, tradeSide };
}
