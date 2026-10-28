"use client";

import { useCallback, useState } from "react";
import { useLiveChart, type LiveAccountUpdate } from "@/components/chart/useLiveChart";
import type { AccountSummary, OpenPositionRow } from "@/lib/broker/loadPositionsPageData";
import { ACCOUNT_LIVE_SYMBOL } from "@/lib/mt5/liveAccountSnapshot";

function toOpenRows(positions: NonNullable<LiveAccountUpdate["positions"]>): OpenPositionRow[] {
  return positions.map((p) => ({
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    volume: p.volume,
    openPrice: p.entryPrice,
    currentPrice: p.currentPrice,
    profit: p.profit,
    stopLoss: p.stopLoss,
    takeProfit: p.takeProfit,
    openTime: p.openTime,
  }));
}

export function useLiveAccount(brokerAccountId: string | null) {
  const [liveFigures, setLiveFigures] = useState<AccountSummary | null>(null);
  const [livePositions, setLivePositions] = useState<OpenPositionRow[] | null>(null);
  const [liveAt, setLiveAt] = useState<string | null>(null);

  const onAccount = useCallback((update: LiveAccountUpdate) => {
    setLiveFigures({
      balance: update.balance,
      equity: update.equity,
      margin: update.margin,
      freeMargin: update.freeMargin,
      marginLevel: update.marginLevel,
      currency: update.currency,
    });
    // Omit means the book is not yet known — keep the SSR snapshot.
    if (update.positions) {
      setLivePositions(toOpenRows(update.positions));
    }
    setLiveAt(update.timestamp);
  }, []);

  const live = useLiveChart({
    enabled: Boolean(brokerAccountId),
    accountId: brokerAccountId,
    displaySymbol: "ACCOUNT",
    brokerSymbol: ACCOUNT_LIVE_SYMBOL,
    timeframeKey: "h1",
    onAccount,
  });

  return { liveFigures, livePositions, liveAt, status: live.status, transport: live.transport };
}
