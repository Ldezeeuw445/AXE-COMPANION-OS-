"use client";

/**
 * Virtual paper-trading positions for AXE Demo Account.
 *
 * Persisted in localStorage per (user, broker account) so a fresh sign-in
 * keeps the demo book; switching accounts or symbols never bleeds state.
 *
 * Live PnL is re-derived on every render from the latest tick the chart
 * already has (`livePrice`) — we don't store equity, only the entry. That
 * keeps the model honest: PnL is always "what would this position be worth
 * right now if I closed at the current broker price".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DemoSide = "buy" | "sell";

export type DemoPosition = {
  id: string;
  brokerAccountId: string;
  symbol: string;
  side: DemoSide;
  /** Lots, e.g. "0.10" → 0.1. */
  volume: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  /** ISO timestamp when the virtual fill was opened. */
  openedAt: string;
};

const STORAGE_KEY = "axe.demo.positions.v1";

function loadAll(): DemoPosition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPosition);
  } catch {
    return [];
  }
}

function saveAll(positions: DemoPosition[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    /* quota error — silently ignore, demo is best-effort */
  }
}

function isPosition(p: unknown): p is DemoPosition {
  if (!p || typeof p !== "object") return false;
  const r = p as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.brokerAccountId === "string" &&
    typeof r.symbol === "string" &&
    (r.side === "buy" || r.side === "sell") &&
    typeof r.volume === "number" &&
    typeof r.entryPrice === "number" &&
    typeof r.openedAt === "string"
  );
}

/**
 * Pip / point sizing: this is intentionally simple. AXE Demo is a "feel"
 * trainer, not a backtest. We use a flat $/point per lot so PnL feels
 * directionally right across symbols without needing a contract-spec table.
 */
function pointValuePerLot(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("XAU")) return 100; // 1.00 = $100/lot
  if (s.includes("BTC")) return 1; // 1$ price move ≈ $1/lot
  if (s.includes("ETH")) return 1;
  if (s.includes("JPY")) return 1000; // 0.01 ≈ ~$10/lot → 1.00 ≈ $1000
  if (s.includes("US30") || s.includes("US500") || s.includes("NAS100") || s.includes("SPX500")) {
    return 1;
  }
  if (s.length === 6) return 100_000; // FX major-ish: 0.0001 ≈ $10/lot → 1.0 ≈ $100k
  return 1;
}

export function computeLivePnl(p: DemoPosition, livePrice: number | null | undefined): number {
  if (livePrice == null || !Number.isFinite(livePrice)) return 0;
  const direction = p.side === "buy" ? 1 : -1;
  const move = (livePrice - p.entryPrice) * direction;
  return move * pointValuePerLot(p.symbol) * p.volume;
}

export type UseDemoPositionsReturn = {
  /** All positions on the active demo account, regardless of symbol. */
  all: DemoPosition[];
  /** Positions on the currently focused symbol, ticking by livePrice. */
  forSymbol: DemoPosition[];
  /** Sum PnL of positions on the focused symbol. */
  pnlOnSymbol: number;
  /** Sum PnL of all open positions on the active demo account. */
  pnlAll: number;
  open: (input: {
    symbol: string;
    side: DemoSide;
    volume: number;
    entryPrice: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
  }) => DemoPosition | null;
  close: (id: string) => void;
  closeAll: () => void;
};

/**
 * @param brokerAccountId  the active broker_account row id (so demo book
 *                         stays scoped per workspace; switching accounts
 *                         hides positions instead of mixing them).
 * @param activeSymbol     the chart's currently-focused symbol.
 * @param livePrice        the chart's most recent live tick.
 */
export function useDemoPositions(
  brokerAccountId: string | null | undefined,
  activeSymbol: string,
  livePrice: number | null | undefined,
): UseDemoPositionsReturn {
  const [positions, setPositions] = useState<DemoPosition[]>(() => loadAll());

  // Keep storage in sync (defensive — useful across tabs / soft reloads).
  useEffect(() => {
    saveAll(positions);
  }, [positions]);

  // Sync if another tab mutates the store.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setPositions(loadAll());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Auto-close when SL / TP is touched on a live tick.
  const closeRef = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    if (livePrice == null || !Number.isFinite(livePrice)) return;
    setPositions((prev) => {
      const survivors: DemoPosition[] = [];
      let changed = false;
      for (const p of prev) {
        if (p.brokerAccountId !== brokerAccountId) {
          survivors.push(p);
          continue;
        }
        if (p.symbol !== activeSymbol) {
          survivors.push(p);
          continue;
        }
        const stopHit =
          p.stopLoss != null &&
          (p.side === "buy" ? livePrice <= p.stopLoss : livePrice >= p.stopLoss);
        const takeHit =
          p.takeProfit != null &&
          (p.side === "buy" ? livePrice >= p.takeProfit : livePrice <= p.takeProfit);
        if (stopHit || takeHit) {
          changed = true;
          continue;
        }
        survivors.push(p);
      }
      return changed ? survivors : prev;
    });
  }, [activeSymbol, brokerAccountId, livePrice]);

  closeRef.current = (id: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  };

  const open = useCallback<UseDemoPositionsReturn["open"]>(
    ({ symbol, side, volume, entryPrice, stopLoss, takeProfit }) => {
      if (!brokerAccountId) return null;
      const id = `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const next: DemoPosition = {
        id,
        brokerAccountId,
        symbol: symbol.toUpperCase(),
        side,
        volume,
        entryPrice,
        stopLoss: stopLoss ?? null,
        takeProfit: takeProfit ?? null,
        openedAt: new Date().toISOString(),
      };
      setPositions((prev) => [next, ...prev]);
      return next;
    },
    [brokerAccountId],
  );

  const close = useCallback((id: string) => {
    closeRef.current(id);
  }, []);

  const closeAll = useCallback(() => {
    setPositions((prev) => prev.filter((p) => p.brokerAccountId !== brokerAccountId));
  }, [brokerAccountId]);

  const allForAccount = useMemo(
    () => (brokerAccountId ? positions.filter((p) => p.brokerAccountId === brokerAccountId) : []),
    [brokerAccountId, positions],
  );

  const forSymbol = useMemo(
    () => allForAccount.filter((p) => p.symbol === activeSymbol.toUpperCase()),
    [allForAccount, activeSymbol],
  );

  const pnlOnSymbol = useMemo(
    () => forSymbol.reduce((sum, p) => sum + computeLivePnl(p, livePrice), 0),
    [forSymbol, livePrice],
  );

  const pnlAll = useMemo(
    () => allForAccount.reduce((sum, p) => sum + computeLivePnl(p, livePrice), 0),
    [allForAccount, livePrice],
  );

  return { all: allForAccount, forSymbol, pnlOnSymbol, pnlAll, open, close, closeAll };
}
