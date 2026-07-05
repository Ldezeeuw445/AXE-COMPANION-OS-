"use client";

/**
 * WatchlistPageScreen — MT5-style interactive quotes screen.
 *
 * Features:
 * - Live bid/ask with green/red tick-direction colors
 * - Add symbols via search (filters broker universe + canonical list)
 * - Remove symbols (swipe or edit mode)
 * - Drag to reorder (edit mode)
 * - Tap row → chart
 * - Spread column
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { formatBrokerPrice, priceDigitsForSymbol } from "@/lib/broker/symbolFormat";
import { addBrokerWatchlistSymbol, removeWatchlistItem, saveWatchlistOrder } from "@/app/(app)/settings/actions";
import { CANONICAL_BROKER_SYMBOLS } from "@/lib/broker/brokerSymbolRuntime";
import { cleanDisplaySymbol } from "@/lib/broker/symbolResolution";
import { GripVertical, Plus, Search, Trash2, X } from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────── */

export type QuoteRow = {
  id: string;
  symbol: string;
  message: string | null;
  brokerSymbol?: string | null;
  runtimePrice?: number | null;
  bid?: number | null;
  ask?: number | null;
  spread?: number | null;
  freshness?: string | null;
  runtimeState?: "live" | "degraded" | "warming" | "unavailable" | "inactive";
  supportLabel?: string;
  supportTone?: "live" | "warm" | "muted" | "blocked";
  dayChangePercent?: number | null;
};

type Props = {
  items: QuoteRow[];
  brokerUniverse?: string[];
  symbolMap?: Record<string, string>;
  accountLabel?: string;
};

/* ── Helpers ────────────────────────────────────────────────────── */

const ORDER_KEY = "axe.quotes.order";

function readOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeOrder(symbols: string[]) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(symbols));
  } catch {
    /* ignore */
  }
}

function applyOrder(items: QuoteRow[], savedOrder: string[]): QuoteRow[] {
  if (savedOrder.length === 0) return items;
  const map = new Map(items.map((i) => [i.symbol, i]));
  const ordered: QuoteRow[] = [];
  for (const sym of savedOrder) {
    const item = map.get(sym);
    if (item) {
      ordered.push(item);
      map.delete(sym);
    }
  }
  // Append any items not in saved order (newly added)
  for (const item of map.values()) ordered.push(item);
  return ordered;
}

/* ── Tick direction tracking ────────────────────────────────────── */

type TickDir = "up" | "down" | "flat";

function useTickColors(items: QuoteRow[]) {
  const prevBid = useRef<Map<string, number>>(new Map());
  const prevAsk = useRef<Map<string, number>>(new Map());
  const [bidDir, setBidDir] = useState<Map<string, TickDir>>(new Map());
  const [askDir, setAskDir] = useState<Map<string, TickDir>>(new Map());

  useEffect(() => {
    const newBidDir = new Map<string, TickDir>();
    const newAskDir = new Map<string, TickDir>();
    for (const item of items) {
      const sym = item.symbol;
      const bid = item.bid;
      const ask = item.ask;
      const prevB = prevBid.current.get(sym);
      const prevA = prevAsk.current.get(sym);

      if (bid != null && prevB != null) {
        newBidDir.set(sym, bid > prevB ? "up" : bid < prevB ? "down" : bidDir.get(sym) ?? "flat");
      }
      if (ask != null && prevA != null) {
        newAskDir.set(sym, ask > prevA ? "up" : ask < prevA ? "down" : askDir.get(sym) ?? "flat");
      }
      if (bid != null) prevBid.current.set(sym, bid);
      if (ask != null) prevAsk.current.set(sym, ask);
    }
    if (newBidDir.size > 0) setBidDir((prev) => new Map([...prev, ...newBidDir]));
    if (newAskDir.size > 0) setAskDir((prev) => new Map([...prev, ...newAskDir]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return { bidDir, askDir };
}

/* ── Component ──────────────────────────────────────────────────── */

export function WatchlistPageScreen({
  items,
  brokerUniverse = [],
  symbolMap = {},
  accountLabel = "Active broker",
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [localItems, setLocalItems] = useState<QuoteRow[]>(() => applyOrder(items, readOrder()));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { bidDir, askDir } = useTickColors(localItems);

  const persistOrder = useCallback((rows: QuoteRow[]) => {
    const symbols = rows.map((item) => item.symbol);
    writeOrder(symbols);
    void saveWatchlistOrder(symbols);
  }, []);

  /* ── Live price polling — fetches latest prices every 2s ────────── */
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/quotes/prices", { credentials: "include" });
        if (!res.ok || !active) return;
        const json = (await res.json()) as {
          prices: Record<string, { bid: number | null; ask: number | null; price: number | null; spread: number | null; tickAt: string | null; status: string | null }>;
        };
        if (!active || !json.prices) return;
        setLocalItems((prev) =>
          prev.map((item) => {
            const p = json.prices[item.symbol];
            if (!p) return item;
            return {
              ...item,
              bid: p.bid ?? item.bid,
              ask: p.ask ?? item.ask,
              runtimePrice: p.price ?? item.runtimePrice,
              spread: p.spread ?? item.spread,
              freshness: p.tickAt ?? item.freshness,
              runtimeState: p.status === "live" ? "live" as const : item.runtimeState,
            };
          }),
        );
      } catch {
        /* ignore fetch errors */
      }
    };
    // Initial fetch + interval
    void poll();
    const timer = setInterval(poll, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Keep items in sync with server data (but preserve order)
  useEffect(() => {
    setLocalItems((prev) => {
      const prevOrder = prev.map((i) => i.symbol);
      const newMap = new Map(items.map((i) => [i.symbol, i]));
      // Update existing items with fresh data, keep order
      const updated = prevOrder
        .map((sym) => newMap.get(sym))
        .filter((i): i is QuoteRow => i != null);
      // Add new items not in current order
      for (const item of items) {
        if (!prevOrder.includes(item.symbol)) updated.push(item);
      }
      return updated;
    });
  }, [items]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  /* ── Broker symbol candidates (MT5-style market watch add) ── */
  const searchCandidates = useMemo(() => {
    const existing = new Set(localItems.map((i) => i.symbol.toUpperCase()));
    const displayToBroker = new Map<string, string>();

    const addCandidate = (display: string, broker: string) => {
      const clean = cleanDisplaySymbol(display) || display.toUpperCase();
      if (!clean || existing.has(clean) || displayToBroker.has(clean)) return;
      displayToBroker.set(clean, broker && broker !== clean ? broker : "");
    };

    for (const [display, broker] of Object.entries(symbolMap)) {
      addCandidate(display, broker);
    }

    for (const raw of brokerUniverse) {
      const clean = cleanDisplaySymbol(raw) || raw.replace(/\.[a-zA-Z]+$/, "").toUpperCase();
      const broker = raw.trim();
      addCandidate(clean, broker !== clean ? broker : "");
    }

    if (displayToBroker.size === 0) {
      for (const sym of CANONICAL_BROKER_SYMBOLS) {
        addCandidate(sym, "");
      }
    }

    return [...displayToBroker.entries()]
      .map(([display, broker]) => ({ display, broker }))
      .sort((a, b) => a.display.localeCompare(b.display));
  }, [localItems, brokerUniverse, symbolMap]);

  const hasBrokerCatalog = brokerUniverse.length > 0 || Object.keys(symbolMap).length > 0;

  const filtered = useMemo(() => {
    const limit = searchQuery.trim() ? 80 : 120;
    if (!searchQuery.trim()) return searchCandidates.slice(0, limit);
    const q = searchQuery.trim().toUpperCase();
    return searchCandidates
      .filter((s) => s.display.includes(q) || s.broker.toUpperCase().includes(q))
      .slice(0, limit);
  }, [searchCandidates, searchQuery]);

  /* ── Handlers ──────────────────────────────────────────────────── */

  const handleAdd = useCallback(
    async (symbol: string, brokerSymbol?: string) => {
      setAdding(true);
      setSearchQuery("");
      const result = await addBrokerWatchlistSymbol(symbol, brokerSymbol);
      if (!result.error) {
        setLocalItems((prev) => {
          const exists = prev.some((i) => i.symbol === symbol);
          if (exists) return prev;
          const next = [
            ...prev,
            {
              id: `temp-${symbol}`,
              symbol,
              message: null,
              brokerSymbol: brokerSymbol || symbolMap[symbol] || null,
              runtimeState: "warming",
            },
          ];
          persistOrder(next);
          return next;
        });
        setSearchOpen(false);
        startTransition(() => router.refresh());
      }
      setAdding(false);
    },
    [persistOrder, router, startTransition, symbolMap],
  );

  const handleRemove = useCallback(
    async (id: string, symbol: string) => {
      setRemoving((prev) => new Set(prev).add(symbol));
      await removeWatchlistItem(id);
      setLocalItems((prev) => {
        const next = prev.filter((i) => i.id !== id);
        persistOrder(next);
        return next;
      });
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(symbol);
        return next;
      });
      startTransition(() => router.refresh());
    },
    [persistOrder, router, startTransition],
  );

  /* ── Drag to reorder ───────────────────────────────────────────── */

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback(
    (idx: number) => {
      if (dragIdx == null || dragIdx === idx) return;
      setLocalItems((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(idx, 0, moved);
        return next;
      });
      setDragIdx(idx);
    },
    [dragIdx],
  );

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    persistOrder(localItems);
  }, [localItems, persistOrder]);

  /* ── Touch drag handlers (mobile-friendly) ─────────────────────── */
  const touchStartY = useRef(0);
  const touchRowHeight = useRef(52);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, idx: number) => {
      touchStartY.current = e.touches[0].clientY;
      const row = (e.target as HTMLElement).closest("[data-row-idx]");
      if (row) touchRowHeight.current = row.getBoundingClientRect().height;
      setDragIdx(idx);
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (dragIdx == null) return;
      e.preventDefault();
      const dy = e.touches[0].clientY - touchStartY.current;
      const rowsMoved = Math.round(dy / touchRowHeight.current);
      const newIdx = Math.max(0, Math.min(localItems.length - 1, dragIdx + rowsMoved));
      if (newIdx !== dragIdx) {
        touchStartY.current = e.touches[0].clientY;
        setLocalItems((prev) => {
          const next = [...prev];
          const [moved] = next.splice(dragIdx, 1);
          next.splice(newIdx, 0, moved);
          return next;
        });
        setDragIdx(newIdx);
      }
    },
    [dragIdx, localItems.length],
  );

  const handleTouchEnd = useCallback(() => {
    setDragIdx(null);
    persistOrder(localItems);
  }, [localItems, persistOrder]);

  /* ── Tick color class ──────────────────────────────────────────── */

  function tickColor(dir: TickDir | undefined, type: "bid" | "ask"): string {
    if (dir === "up") return "text-cyan-400";
    if (dir === "down") return "text-rose-400";
    // Default: bid = cyan, ask = red (AXE identity — like MT5 blue/red)
    return type === "bid" ? "text-cyan-400/70" : "text-rose-400/70";
  }

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTitleInjector title="Quotes" />

      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <span className="text-[13px] font-bold text-white/90">
          Quotes
          <span className="ml-2 text-[11px] font-medium text-white/30">
            {localItems.length}
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setSearchOpen((v) => !v);
              setSearchQuery("");
            }}
            className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80"
            aria-label="Add symbol"
          >
            {searchOpen ? <X size={16} /> : <Plus size={16} />}
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              editing
                ? "bg-cyan-500/15 text-cyan-400"
                : "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
            }`}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {/* ── Search panel ───────────────────────────────────────── */}
      {searchOpen && (
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/25">
            {hasBrokerCatalog ? `Add from ${accountLabel}` : "Add symbol"}
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <Search size={14} className="shrink-0 text-white/30" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={hasBrokerCatalog ? "Search broker symbols…" : "Search symbols…"}
              className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/25 focus:outline-none"
            />
          </div>
          {!hasBrokerCatalog && (
            <p className="mt-2 px-1 text-[10px] text-white/30">
              Sync your MT5 account first to browse symbols offered by your broker.
            </p>
          )}
          {filtered.length > 0 && (
            <div className="mt-2 max-h-[320px] overflow-y-auto">
              {filtered.map((item) => (
                <button
                  key={`${item.display}-${item.broker}`}
                  type="button"
                  disabled={adding}
                  onClick={() => handleAdd(item.display, item.broker || undefined)}
                  className="flex w-full items-center justify-between px-2 py-2 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] disabled:opacity-40"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-white/80">
                      {item.display}
                    </span>
                    {item.broker && item.broker !== item.display && (
                      <span className="font-mono text-[10px] text-white/25">
                        {item.broker}
                      </span>
                    )}
                  </div>
                  <Plus size={14} className="text-cyan-400/60" />
                </button>
              ))}
            </div>
          )}
          {filtered.length === 0 && searchQuery.trim() && hasBrokerCatalog && (
            <div className="mt-2 px-2 py-3 text-center">
              <p className="text-[11px] text-white/30">No matching broker symbols</p>
            </div>
          )}
          {filtered.length === 0 && searchQuery.trim() && !hasBrokerCatalog && (
            <div className="mt-2 px-2 py-3 text-center">
              <p className="text-[11px] text-white/30">No matching symbols</p>
              <button
                type="button"
                disabled={adding}
                onClick={() => handleAdd(searchQuery.trim().toUpperCase())}
                className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/60 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
              >
                Add &quot;{searchQuery.trim().toUpperCase()}&quot; anyway
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Column header ──────────────────────────────────────── */}
      <div className="flex items-center px-4 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/20">
        {editing && <span className="w-8" />}
        <span className="flex-1">Symbol</span>
        <span className="w-[72px] text-right">Bid</span>
        <span className="w-[72px] text-right">Ask</span>
        <span className="w-[52px] text-right">Spread</span>
        {editing && <span className="w-10" />}
      </div>

      {/* ── Quote rows ─────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {localItems.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16">
            <p className="text-[13px] text-white/40">No symbols in your watchlist</p>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="rounded-lg border border-white/[0.10] bg-white/[0.05] px-4 py-2 text-[12px] font-semibold text-white/70 transition-colors hover:bg-white/[0.08]"
            >
              Add symbols
            </button>
          </div>
        )}
        {localItems.map((item, i) => {
          const sym = item.symbol;
          const bs = item.brokerSymbol ?? sym;
          const bid = item.bid;
          const ask = item.ask;
          const spread = item.spread;
          const digits = priceDigitsForSymbol(bs);
          const isRemoving = removing.has(sym);
          const isDragging = dragIdx === i;

          return (
            <div
              key={item.id}
              data-row-idx={i}
              onDragOver={(e) => {
                e.preventDefault();
                handleDragOver(i);
              }}
              className={`flex items-center transition-all ${
                i % 2 === 1 ? "bg-white/[0.015]" : ""
              } ${isDragging ? "scale-[1.02] bg-white/[0.04] shadow-lg" : ""} ${
                isRemoving ? "pointer-events-none opacity-30" : ""
              }`}
            >
              {/* Drag handle */}
              {editing && (
                <div
                  className="flex w-8 cursor-grab items-center justify-center text-white/20 active:cursor-grabbing active:text-white/40"
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => handleTouchStart(e, i)}
                  onTouchMove={(e) => handleTouchMove(e)}
                  onTouchEnd={handleTouchEnd}
                >
                  <GripVertical size={14} />
                </div>
              )}

              {/* Row content — tappable */}
              <button
                type="button"
                onClick={() => {
                  if (!editing) {
                    router.push(`/chart?symbol=${encodeURIComponent(sym)}`);
                  }
                }}
                className={`flex flex-1 items-center px-4 py-3 text-left transition-colors ${
                  editing ? "cursor-default" : "active:bg-white/[0.04]"
                }`}
              >
                {/* Symbol + status */}
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[13px] font-bold tracking-wide text-white">
                    {sym}
                  </span>
                  {item.runtimeState === "live" && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
                  )}
                  {item.runtimeState === "warming" && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400/50" />
                  )}
                </div>

                {/* Bid */}
                <span
                  className={`w-[72px] text-right font-mono text-[12px] font-semibold tabular-nums transition-colors duration-300 ${tickColor(bidDir.get(sym), "bid")}`}
                >
                  {bid != null ? formatBrokerPrice(bs, bid) : "—"}
                </span>

                {/* Ask */}
                <span
                  className={`w-[72px] text-right font-mono text-[12px] font-semibold tabular-nums transition-colors duration-300 ${tickColor(askDir.get(sym), "ask")}`}
                >
                  {ask != null ? formatBrokerPrice(bs, ask) : "—"}
                </span>

                {/* Spread */}
                <span className="w-[52px] text-right font-mono text-[10px] tabular-nums text-white/25">
                  {spread != null && Number.isFinite(spread)
                    ? spread < 0.01
                      ? (spread * (10 ** digits)).toFixed(1)
                      : spread.toFixed(digits > 2 ? digits - 1 : digits)
                    : "—"}
                </span>
              </button>

              {/* Remove button */}
              {editing && (
                <button
                  type="button"
                  onClick={() => handleRemove(item.id, sym)}
                  disabled={isRemoving}
                  className="flex w-10 items-center justify-center text-rose-400/50 transition-colors hover:text-rose-400 disabled:opacity-30"
                  aria-label={`Remove ${sym}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
