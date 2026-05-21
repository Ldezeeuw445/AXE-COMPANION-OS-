import Link from "next/link";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";

import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { formatBrokerPrice } from "@/lib/broker/symbolFormat";

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
};

const DEFAULTS = ["XAUUSD", "EURUSD", "BTCUSD"];

type Props = {
  items: Row[];
};

function StatusDot({ tone }: { tone: string }) {
  const color =
    tone === "live"
      ? "bg-emerald-400"
      : tone === "warm"
        ? "bg-amber-400"
        : tone === "blocked"
          ? "bg-rose-400"
          : "bg-white/20";
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${color}`}
      aria-hidden
    />
  );
}

function PriceDisplay({ value, symbol }: { value: number | null | undefined; symbol: string }) {
  if (!value) return <span className="text-tos-dim">—</span>;
  return (
    <span className="font-mono font-semibold tabular-nums text-tos-text">
      {formatBrokerPrice(symbol, value)}
    </span>
  );
}

export function WatchlistPageScreen({ items }: Props) {
  const itemMap = new Map(items.map((i) => [i.symbol, i]));
  const merged = [...new Set([...items.map((i) => i.symbol), ...DEFAULTS])];

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col gap-4 pb-2">
      <LiveStatusReporter
        liveCount={items.filter((i) => i.runtimeState === "live").length}
        totalCount={items.length}
        label={`Watchlist · ${items.length} saved`}
        allLiveOverride={null}
        severity={items.length === 0 ? "inactive" : items.some((i) => i.runtimeState === "live") ? "fresh" : "degraded"}
        reason={items.length === 0 ? "No watchlist symbols yet." : "Watchlist shows broker support and price availability per symbol."}
        scope="watchlist"
      />
      <PageTitleInjector title="Quotes" />

      {/* Quotes grid */}
      <div className="space-y-2">
        {merged.map((sym) => {
          const item = itemMap.get(sym);
          const tone = item?.supportTone ?? "muted";
          const isLive = tone === "live" || item?.runtimeState === "live";
          const isDegraded = item?.runtimeState === "degraded";

          return (
            <Link
              key={sym}
              href={`/chart?symbol=${encodeURIComponent(sym)}`}
              className="tos-watchlist-row block px-4 py-3 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center justify-between gap-3">
                {/* Left: symbol + status */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusDot tone={tone} />
                    <span className="font-mono text-sm font-bold tracking-wide text-tos-text">
                      {sym}
                    </span>
                    {item?.brokerSymbol && item.brokerSymbol !== sym ? (
                      <span className="text-[9px] text-tos-dim">
                        {item.brokerSymbol}
                      </span>
                    ) : null}
                    {isLive ? (
                      <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-widest text-emerald-400">
                        Live
                      </span>
                    ) : isDegraded ? (
                      <span className="rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-widest text-amber-300">
                        Degraded
                      </span>
                    ) : null}
                  </div>
                  {/* Bid / Ask / Spread row */}
                  <div className="mt-1.5 flex items-center gap-4 text-[10px]">
                    <span className="text-tos-dim">
                      Bid <PriceDisplay value={item?.bid} symbol={item?.brokerSymbol ?? sym} />
                    </span>
                    <span className="text-tos-dim">
                      Ask <PriceDisplay value={item?.ask} symbol={item?.brokerSymbol ?? sym} />
                    </span>
                    <span className="text-tos-dim">
                      Spread{" "}
                      <span className="font-mono font-medium tabular-nums text-tos-muted">
                        {item?.spread != null ? formatBrokerPrice(item?.brokerSymbol ?? sym, item.spread) : "—"}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Right: price + freshness */}
                <div className="shrink-0 text-right">
                  <div className="font-mono text-base font-bold tabular-nums text-tos-text">
                    {item?.bid ? formatBrokerPrice(item?.brokerSymbol ?? sym, item.bid) : "—"}
                  </div>
                  <div className="mt-0.5 text-[9px] text-tos-dim">
                    {item?.freshness
                      ? new Date(item.freshness).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                      : "—"}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>


    </div>
  );
}
