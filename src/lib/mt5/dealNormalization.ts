/**
 * Group MetaApi history deals by MT5 positionId into closed-trade rows for broker_trades.
 * Uses stable external_trade_id: metaapi:<positionId> (one row per closed position).
 */

export type MetaApiDeal = {
  id?: string;
  type?: string;
  entryType?: string;
  symbol?: string;
  time?: string;
  volume?: number;
  price?: number;
  commission?: number;
  swap?: number;
  profit?: number;
  positionId?: string;
};

export type NormalizedClosedTrade = {
  external_trade_id: string;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  open_time: string | null;
  close_time: string | null;
  open_price: number | null;
  close_price: number | null;
  pnl: number;
  fees: number;
  raw: Record<string, unknown>;
};

function isBuySellDeal(d: MetaApiDeal): boolean {
  return d.type === "DEAL_TYPE_BUY" || d.type === "DEAL_TYPE_SELL";
}

function inferSideFromOut(out: MetaApiDeal): "buy" | "sell" {
  // Closing a long is a SELL deal; closing a short is a BUY deal.
  if (out.type === "DEAL_TYPE_SELL") return "buy";
  if (out.type === "DEAL_TYPE_BUY") return "sell";
  return "buy";
}

export function normalizeDealsToClosedTrades(deals: MetaApiDeal[]): NormalizedClosedTrade[] {
  const filtered = deals.filter(
    (d) => d.positionId && d.symbol && isBuySellDeal(d),
  ) as MetaApiDeal[];

  const byPos = new Map<string, MetaApiDeal[]>();
  for (const d of filtered) {
    const pid = String(d.positionId);
    const arr = byPos.get(pid) ?? [];
    arr.push(d);
    byPos.set(pid, arr);
  }

  const out: NormalizedClosedTrade[] = [];

  for (const [positionId, group] of byPos) {
    group.sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));

    const ins = group.filter(
      (x) => x.entryType === "DEAL_ENTRY_IN" || x.entryType === "DEAL_ENTRY_INOUT",
    );
    const outs = group.filter(
      (x) => x.entryType === "DEAL_ENTRY_OUT" || x.entryType === "DEAL_ENTRY_OUT_BY",
    );

    if (outs.length === 0) continue;

    const firstIn = ins[0];
    const lastOut = outs[outs.length - 1];

    const side: "buy" | "sell" = firstIn?.type
      ? firstIn.type === "DEAL_TYPE_BUY"
        ? "buy"
        : firstIn.type === "DEAL_TYPE_SELL"
          ? "sell"
          : inferSideFromOut(lastOut)
      : inferSideFromOut(lastOut);

    let pnl = 0;
    let fees = 0;
    for (const d of group) {
      pnl += Number(d.profit ?? 0) || 0;
      fees += (Number(d.commission ?? 0) || 0) + (Number(d.swap ?? 0) || 0);
    }

    const volume = Number(firstIn?.volume ?? lastOut.volume ?? 0) || 0;

    out.push({
      external_trade_id: `metaapi:${positionId}`,
      symbol: String(firstIn?.symbol ?? lastOut.symbol ?? ""),
      side,
      volume,
      open_time: firstIn?.time ?? null,
      close_time: lastOut.time ?? null,
      open_price: firstIn?.price != null ? Number(firstIn.price) : null,
      close_price: lastOut.price != null ? Number(lastOut.price) : null,
      pnl,
      fees,
      raw: { positionId, deals: group },
    });
  }

  return out;
}
