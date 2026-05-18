import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { WatchlistManager } from "@/components/settings/WatchlistManager";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";

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

export function WatchlistPageScreen({ items }: Props) {
  const itemMap = new Map(items.map((i) => [i.symbol, i]));
  const merged = [...new Set([...items.map((i) => i.symbol), ...DEFAULTS])];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-2">
      <LiveStatusReporter
        liveCount={items.filter((i) => i.runtimeState === "live").length}
        totalCount={items.length}
        label={`Watchlist · ${items.length} saved`}
        allLiveOverride={null}
        severity={items.length === 0 ? "inactive" : items.some((i) => i.runtimeState === "live") ? "fresh" : "degraded"}
        reason={items.length === 0 ? "No watchlist symbols yet." : "Watchlist shows broker support and price availability per symbol."}
        scope="watchlist"
      />
      <ScreenHeader
        title="Watchlist"
        subtitle="Symbols AXE uses for chat context, news/macro filtering and alerts. Prices come from your connected MT5 account when you open Chart."
        left={<BarChart3 className="h-6 w-6 text-cyan-400/80" aria-hidden />}
      />

      <GlassPanel className="p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">Your symbols</h2>
        <p className="mt-1 text-xs text-tos-muted">Edit here or in Settings — same list.</p>
        <div className="mt-3">
          <WatchlistManager items={items} />
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">Quick open chart</h2>
        <ul className="mt-2 space-y-2">
          {merged.map((sym) => {
            const item = itemMap.get(sym);
            const tone = item?.supportTone ?? "muted";
            const supportClass =
              tone === "live"
                ? "border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-100/85"
                : tone === "warm"
                  ? "border-amber-400/20 bg-amber-400/[0.07] text-amber-100/85"
                  : tone === "blocked"
                    ? "border-rose-400/20 bg-rose-400/[0.07] text-rose-100/85"
                  : "border-white/10 bg-white/[0.025] text-tos-dim";
            return (
            <li key={sym} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <div className="min-w-0">
                <span className="font-mono text-sm text-tos-text">{sym}</span>
                {item?.brokerSymbol && item.brokerSymbol !== sym ? (
                  <p className="mt-0.5 text-[10px] text-tos-dim">Broker: {item.brokerSymbol}</p>
                ) : null}
                <p className="mt-0.5 text-[10px] text-tos-dim">
                  Price:{" "}
                  {item?.runtimeState === "live" || item?.runtimeState === "degraded"
                    ? item.runtimePrice ?? "unavailable"
                    : "unavailable"}
                </p>
                {item?.bid != null || item?.ask != null ? (
                  <p className="mt-0.5 text-[10px] text-tos-dim">
                    Bid/Ask: <span className="font-mono">{item.bid ?? "—"} / {item.ask ?? "—"}</span>
                    {item.spread != null ? <span> · spread {item.spread.toFixed(2)}</span> : null}
                  </p>
                ) : null}
                {item?.freshness ? (
                  <p className="mt-0.5 text-[10px] text-tos-dim">Freshness: {new Date(item.freshness).toLocaleTimeString()}</p>
                ) : null}
              </div>
              <div className="flex gap-2 text-[11px]">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${supportClass}`}>
                  {item?.supportLabel ?? "Awaiting broker map"}
                </span>
                <Link href={`/chart?symbol=${encodeURIComponent(sym)}`} className="text-cyan-400 hover:underline">
                  Chart
                </Link>
                <Link
                  href={`/chat?q=${encodeURIComponent(`[AXE · ${sym}]\nWhat matters for ${sym} today given my watchlist and open positions?`)}`}
                  className="text-cyan-400/80 hover:underline"
                >
                  Ask AXE
                </Link>
                <Link href={`/alerts?symbol=${encodeURIComponent(sym)}`} className="text-tos-muted hover:underline">
                  Alert
                </Link>
              </div>
            </li>
            );
          })}
        </ul>
      </GlassPanel>
    </div>
  );
}
