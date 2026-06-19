export type AlertTradeSide = "buy" | "sell";

export function parseOptionalPrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Validate SL/TP relative to entry for the trade side. */
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
    if (stopLoss >= entry) return "For a buy, stop loss must be below entry.";
    if (takeProfit <= entry) return "For a buy, take profit must be above entry.";
  } else {
    if (stopLoss <= entry) return "For a sell, stop loss must be above entry.";
    if (takeProfit >= entry) return "For a sell, take profit must be below entry.";
  }
  return null;
}

export function sideForAlertCondition(condition: string | null): AlertTradeSide | null {
  if (condition === "above") return "buy";
  if (condition === "below") return "sell";
  return null;
}

/** Suggest SL/TP from threshold + workspace offsets (price units). */
export function suggestAlertStopsFromOffsets(
  condition: string | null,
  threshold: number,
  slOffset: number | null,
  tpOffset: number | null,
): { stopLoss: number | null; takeProfit: number | null } {
  if (slOffset == null || tpOffset == null || !Number.isFinite(threshold)) {
    return { stopLoss: null, takeProfit: null };
  }
  if (slOffset <= 0 || tpOffset <= 0) return { stopLoss: null, takeProfit: null };

  const side = sideForAlertCondition(condition);
  if (side === "buy") {
    return { stopLoss: threshold - slOffset, takeProfit: threshold + tpOffset };
  }
  if (side === "sell") {
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
}): { stopLoss: number; takeProfit: number } | { error: string } {
  const side = sideForAlertCondition(args.condition);
  if (!side) return { error: "Alert condition must be above or below for auto-trade." };

  const fromMeta = readAlertStopsFromMetadata(args.metadata);
  let stopLoss = fromMeta.stopLoss;
  let takeProfit = fromMeta.takeProfit;

  if (stopLoss == null || takeProfit == null) {
    const suggested = suggestAlertStopsFromOffsets(
      args.condition,
      args.triggerPrice,
      args.slOffset,
      args.tpOffset,
    );
    stopLoss = stopLoss ?? suggested.stopLoss;
    takeProfit = takeProfit ?? suggested.takeProfit;
  }

  if (stopLoss == null || takeProfit == null) {
    return { error: "Alert auto-trade blocked — set stop loss and take profit on the alert." };
  }

  const validation = validateAlertTradeStops(side, args.triggerPrice, stopLoss, takeProfit);
  if (validation) return { error: validation };

  return { stopLoss, takeProfit };
}
