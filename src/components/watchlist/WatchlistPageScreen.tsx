import Link from "next/link";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { formatBrokerPrice } from "@/lib/broker/symbolFormat";

/**
 * WatchlistPageScreen — MT5-style clean quotes table.
 *
 * Clean rows: Symbol | Bid | Ask | Day %
 * No cards, no borders — alternating subtle bg.
 * Prices colored red/green by tick direction.
 * Tap row → chart for that symbol.
 */

type Row = {
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

const DEFAULTS = ["XAUUSD", "EURUSD", "BTCUSD"];

type Props = {
  items: Row[];
};

export function WatchlistPageScreen({ items }: Props) {
  const itemMap = new Map(items.map((i) => [i.symbol, i]));
  const merged = [...new Set([...items.map((i) => i.symbol), ...DEFAULTS])];

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-2">
      <LiveStatusReporter
        liveCount={items.filter((i) => i.runtimeState === "live").length}
        totalCount={items.length}
        label={`Watchlist · ${items.length} saved`}
        allLiveOverride={null}
        severity={
          items.length === 0
            ? "inactive"
            : items.some((i) => i.runtimeState === "live")
              ? "fresh"
              : "degraded"
        }
        reason={
          items.length === 0
            ? "No watchlist symbols yet."
            : "Watchlist shows broker price availability per symbol."
        }
        scope="watchlist"
      />
      <PageTitleInjector title="Quotes" />

      {/* Column header */}
      <div className="flex items-center px-4 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/20">
        <span className="flex-1">Symbol</span>
        <span className="w-20 text-right">Bid</span>
        <span className="w-20 text-right">Ask</span>
        <span className="w-14 text-right">Day %</span>
      </div>

      {/* Quote rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {merged.map((sym, i) => {
          const item = itemMap.get(sym);
          const bid = item?.bid;
          const ask = item?.ask;
          const dayPct = (item as Row & { dayChangePercent?: number | null })?.dayChangePercent ?? null;
          const bs = item?.brokerSymbol ?? sym;
          const isLive = item?.runtimeState === "live" || item?.supportTone === "live";

          return (
            <Link
              key={sym}
              href={`/chart?symbol=${encodeURIComponent(sym)}`}
              className={`flex items-center px-4 py-3 transition-colors active:bg-white/[0.04] ${
                i % 2 === 1 ? "bg-white/[0.015]" : ""
              }`}
            >
              {/* Symbol */}
              <div className="flex-1 min-w-0">
                <span className="font-mono text-[13px] font-bold tracking-wide text-white">
                  {sym}
                </span>
                {!isLive && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-white/10" />
                )}
              </div>

              {/* Bid */}
              <span className="w-20 text-right font-mono text-[12px] font-semibold tabular-nums text-white/80">
                {bid ? formatBrokerPrice(bs, bid) : "—"}
              </span>

              {/* Ask */}
              <span className="w-20 text-right font-mono text-[12px] font-semibold tabular-nums text-white/80">
                {ask ? formatBrokerPrice(bs, ask) : "—"}
              </span>

              {/* Day % */}
              <span
                className={`w-14 text-right font-mono text-[11px] font-semibold tabular-nums ${
                  dayPct != null && dayPct > 0
                    ? "text-emerald-400"
                    : dayPct != null && dayPct < 0
                      ? "text-rose-400"
                      : "text-white/20"
                }`}
              >
                {dayPct != null
                  ? `${dayPct > 0 ? "+" : ""}${dayPct.toFixed(2)}%`
                  : "—"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
