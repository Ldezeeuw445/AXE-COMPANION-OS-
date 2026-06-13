"use client";

/**
 * ChartOrderBookDrawer
 *
 * Slide-out market depth panel for the chart page. Anchored on the live
 * bid/ask values that the chart's own tick stream is already feeding us,
 * so the inner-most level is *real*. The remaining levels are estimated
 * around it with a deterministic falloff — labelled "Synthetic depth"
 * so we never imply we're showing true Level 2 (MT5 retail accounts
 * don't expose DOM through MetaApi).
 *
 * Styling intentionally mirrors the AXE Companion aesthetic: deep
 * black background, cyan accents for the bid side, rose for the ask
 * side, monospace prices, and a single highlight stripe for the
 * inner-most level so the eye lands on the live spread first.
 */

import { useEffect, useMemo, useState } from "react";
import { X, BarChart2 } from "lucide-react";
import { formatBrokerPrice } from "@/lib/broker/symbolFormat";

type Props = {
  open: boolean;
  onClose: () => void;
  symbol: string;
  digits: number;
  /** Live mid (median between bid/ask, or close fallback). */
  livePrice: number | null;
  /** Real broker bid from the live tick stream, when known. */
  bid: number | null;
  /** Real broker ask from the live tick stream, when known. */
  ask: number | null;
  /**
   * Tick size used to spread synthetic levels apart. We pick a sensible
   * fallback from the digit count, but callers can override (e.g. for
   * BTCUSD where 1.0 is meaningful but on EURUSD it would be huge).
   */
  tickSize?: number;
};

const LEVELS_PER_SIDE = 10;

type Row = {
  /** "real" rows mirror the broker's own bid/ask quote. */
  kind: "real" | "synthetic";
  price: number;
  size: number;
  /** Cumulative size from the inner edge — drives the depth bar fill. */
  cumulative: number;
};

function defaultTickSize(digits: number): number {
  if (digits <= 0) return 1;
  return Math.pow(10, -digits);
}

/**
 * Build a deterministic, visually-readable book around the live spread.
 * We never write to localStorage and never run a JS RNG with side effects
 * in render — sizes come from a pure function of (mid, level) so the
 * panel doesn't visibly jitter unless the live price actually moves.
 */
function buildSyntheticBook(args: {
  mid: number;
  bid: number | null;
  ask: number | null;
  tick: number;
}): { bids: Row[]; asks: Row[] } {
  const { mid, bid, ask, tick } = args;
  const safeTick = tick > 0 ? tick : 1e-5;

  // Compute a base size from the mid price magnitude so smaller pairs
  // don't end up with absurdly large lots and BTCUSD doesn't end up
  // with single-decimal sizes. This is purely a visual nicety.
  const baseSize = mid >= 1000 ? 1.5 : mid >= 100 ? 4 : mid >= 10 ? 12 : 30;

  function sizeFor(level: number): number {
    // Slight pseudo-random variance keyed off (mid, level) so refreshes
    // don't flicker but the column doesn't look like a perfect ramp.
    const seed = Math.abs(Math.sin((mid * 1000 + level * 13) % 360)) * 0.5 + 0.75;
    const falloff = Math.exp(-level * 0.18);
    return Number((baseSize * falloff * seed).toFixed(mid >= 1000 ? 2 : 2));
  }

  const bids: Row[] = [];
  const asks: Row[] = [];

  // Top of book: real if we have it.
  const topBidPrice = bid != null && Number.isFinite(bid) ? bid : mid - safeTick * 0.5;
  const topAskPrice = ask != null && Number.isFinite(ask) ? ask : mid + safeTick * 0.5;

  let cumBid = 0;
  let cumAsk = 0;

  // Inner level (closest to mid) gets emphasis + "real" tag if live.
  const innerBidSize = sizeFor(0);
  cumBid += innerBidSize;
  bids.push({
    kind: bid != null ? "real" : "synthetic",
    price: topBidPrice,
    size: innerBidSize,
    cumulative: cumBid,
  });

  const innerAskSize = sizeFor(0);
  cumAsk += innerAskSize;
  asks.push({
    kind: ask != null ? "real" : "synthetic",
    price: topAskPrice,
    size: innerAskSize,
    cumulative: cumAsk,
  });

  for (let i = 1; i < LEVELS_PER_SIDE; i += 1) {
    const bidSize = sizeFor(i);
    cumBid += bidSize;
    bids.push({
      kind: "synthetic",
      price: topBidPrice - safeTick * i,
      size: bidSize,
      cumulative: cumBid,
    });
    const askSize = sizeFor(i + 0.5);
    cumAsk += askSize;
    asks.push({
      kind: "synthetic",
      price: topAskPrice + safeTick * i,
      size: askSize,
      cumulative: cumAsk,
    });
  }

  return { bids, asks };
}

function formatSize(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
  return value.toFixed(2);
}

export function ChartOrderBookDrawer({
  open,
  onClose,
  symbol,
  digits,
  livePrice,
  bid,
  ask,
  tickSize,
}: Props) {
  const tick = tickSize ?? defaultTickSize(digits);
  // Keep a small history of the mid so we can show whether the inside
  // tick was a buy (uptick) or sell (downtick) — a tiny extra signal
  // since we can't get true trade aggressor info from MT5 retail.
  const [lastTickDir, setLastTickDir] = useState<"up" | "down" | "flat">("flat");
  const [previousMid, setPreviousMid] = useState<number | null>(null);

  const mid = useMemo(() => {
    if (bid != null && ask != null && Number.isFinite(bid) && Number.isFinite(ask)) {
      return (bid + ask) / 2;
    }
    return livePrice;
  }, [bid, ask, livePrice]);

  useEffect(() => {
    if (mid == null || !Number.isFinite(mid)) return;
    if (previousMid == null) {
      setPreviousMid(mid);
      return;
    }
    if (mid > previousMid) setLastTickDir("up");
    else if (mid < previousMid) setLastTickDir("down");
    setPreviousMid(mid);
  }, [mid, previousMid]);

  // Close on ESC for desktop kb users — gentle UX touch.
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const book = useMemo(() => {
    if (mid == null || !Number.isFinite(mid)) return null;
    return buildSyntheticBook({ mid, bid, ask, tick });
  }, [mid, bid, ask, tick]);

  const maxCum = useMemo(() => {
    if (!book) return 0;
    const lastBid = book.bids[book.bids.length - 1]?.cumulative ?? 0;
    const lastAsk = book.asks[book.asks.length - 1]?.cumulative ?? 0;
    return Math.max(lastBid, lastAsk, 1);
  }, [book]);

  const spread = bid != null && ask != null ? ask - bid : null;
  const spreadPoints =
    spread != null && tick > 0 ? Math.round((spread / tick) * 10) / 10 : null;

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close order book"
          onClick={onClose}
          className="fixed inset-0 z-[44] bg-black/45 backdrop-blur-[2px]"
        />
      ) : null}

      <aside
<<<<<<< HEAD
        className={`fixed left-0 top-[var(--tos-topbar-offset)] z-[45] flex h-[calc(100dvh-var(--tos-topbar-offset)-var(--tos-nav-offset))] w-[88vw] max-w-[360px] flex-col border-r border-white/10 bg-[#0c0c0c]/96 shadow-[0_24px_72px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-transform duration-200 ease-out ${
=======
        className={`fixed left-0 top-[3.25rem] z-[45] flex h-[calc(100svh-3.25rem)] w-[88vw] max-w-[360px] flex-col border-r border-white/10 bg-[#04070C]/96 shadow-[0_24px_72px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-transform duration-200 ease-out ${
>>>>>>> a4a3600 (feat: Fix Bottom Navigation Bar Issues)
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        /* drawer height already stops above the bottom nav */
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full border border-white/[0.10] bg-white/[0.05]">
              <BarChart2 className="h-3.5 w-3.5 text-emerald-200" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-[12px] font-bold uppercase tracking-wider text-tos-text">
                {symbol} · Depth
              </p>
              <p className="text-[9px] uppercase tracking-[0.2em] text-tos-dim">
                Live spread · L2 estimated
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-[#08080a]/80 text-tos-muted hover:text-white/80"
            aria-label="Close depth"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        {/* Spread strip */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.05] px-3 py-1.5 text-[10px] uppercase tracking-wider text-tos-dim">
          <span className="flex items-center gap-1.5">
            <span className="text-tos-muted">Mid</span>
            <span
              className={`font-mono text-[11px] font-semibold ${
                lastTickDir === "up"
                  ? "text-emerald-200"
                  : lastTickDir === "down"
                    ? "text-rose-300"
                    : "text-tos-text"
              }`}
            >
              {formatBrokerPrice(symbol, mid)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-tos-muted">Spread</span>
            <span className="font-mono text-[11px] text-tos-text">
              {spread != null
                ? `${formatBrokerPrice(symbol, spread)}${spreadPoints != null ? ` · ${spreadPoints}p` : ""}`
                : "—"}
            </span>
          </span>
        </div>

        {/* Column headers */}
        <div className="grid shrink-0 grid-cols-[1fr_64px_64px_1fr] items-center gap-1 border-b border-white/[0.04] bg-white/[0.015] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-tos-dim">
          <span className="text-left">Cum</span>
          <span className="text-right text-rose-200/70">Ask</span>
          <span className="text-left text-emerald-200/80">Bid</span>
          <span className="text-right">Cum</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {!book || mid == null ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-tos-muted">
              Waiting for the live tick stream to seed the inside spread.
            </div>
          ) : (
            <div className="flex h-full flex-col">
              {/* ASKS — descending so closest-to-mid sits at the bottom of this block */}
              <div className="flex-1 overflow-y-auto">
                {[...book.asks].reverse().map((row, idx) => {
                  const fill = Math.min(1, row.cumulative / maxCum);
                  const isInner = idx === book.asks.length - 1;
                  return (
                    <div
                      key={`ask-${idx}`}
                      className={`relative grid grid-cols-[1fr_64px_64px_1fr] items-center gap-1 px-2.5 ${
                        isInner ? "bg-rose-500/[0.07]" : ""
                      }`}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 right-1/2 origin-right bg-rose-500/[0.06]"
                        style={{ width: `${fill * 50}%` }}
                      />
                      <span className="relative font-mono text-[10px] text-tos-dim">
                        {formatSize(row.cumulative)}
                      </span>
                      <span className="relative text-right font-mono text-[11px] font-semibold text-rose-300/95">
                        {formatBrokerPrice(symbol, row.price)}
                      </span>
                      <span className="relative text-left font-mono text-[11px] text-tos-muted">
                        {formatSize(row.size)}
                      </span>
                      <span className="relative text-right font-mono text-[10px] text-tos-dim">
                        {row.kind === "real" ? "L1" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Mid bar */}
              <div className="flex shrink-0 items-center justify-between border-y border-white/[0.06] bg-emerald-400/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/70">
                <span>{lastTickDir === "up" ? "↑ Uptick" : lastTickDir === "down" ? "↓ Downtick" : "·"}</span>
                <span className="font-mono text-[11px] text-white">{formatBrokerPrice(symbol, mid)}</span>
                <span>{spreadPoints != null ? `${spreadPoints}p` : "—"}</span>
              </div>

              {/* BIDS — ascending so closest-to-mid sits at the top of this block */}
              <div className="flex-1 overflow-y-auto">
                {book.bids.map((row, idx) => {
                  const fill = Math.min(1, row.cumulative / maxCum);
                  const isInner = idx === 0;
                  return (
                    <div
                      key={`bid-${idx}`}
                      className={`relative grid grid-cols-[1fr_64px_64px_1fr] items-center gap-1 px-2.5 ${
                        isInner ? "bg-emerald-500/[0.07]" : ""
                      }`}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-1/2 origin-left bg-emerald-500/[0.06]"
                        style={{ width: `${fill * 50}%` }}
                      />
                      <span className="relative font-mono text-[10px] text-tos-dim">
                        {formatSize(row.cumulative)}
                      </span>
                      <span className="relative text-right font-mono text-[11px] text-tos-muted">
                        {formatSize(row.size)}
                      </span>
                      <span className="relative text-left font-mono text-[11px] font-semibold text-white/90">
                        {formatBrokerPrice(symbol, row.price)}
                      </span>
                      <span className="relative text-right font-mono text-[10px] text-tos-dim">
                        {row.kind === "real" ? "L1" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footnote */}
        <div className="shrink-0 border-t border-white/[0.05] px-3 py-2 text-[9.5px] leading-relaxed text-tos-dim">
          The L1 row (top bid + top ask) is the live quote from your MT5 broker
          — same one the chart prices fills against. Surrounding levels are an
          estimated falloff for visual context; MT5 retail accounts do not
          expose true Level 2 depth, so use those rows as a spread-shape cue,
          not as resting liquidity.
        </div>
      </aside>
    </>
  );
}
