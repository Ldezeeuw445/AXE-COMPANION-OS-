import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { WatchlistManager } from "@/components/settings/WatchlistManager";
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
        subtitle="MT5 broker quotes for the active account. Clean symbols stay readable; broker symbols, bid, ask, spread and freshness show the runtime truth."
        left={<BarChart3 className="h-6 w-6 text-cyan-400/80" aria-hidden />}
      />

      <GlassPanel className="p-0">
        <div className="border-b border-white/[0.06] px-3 py-2">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">AXE MT5 quotes</h2>
        </div>
        <ul className="divide-y divide-white/[0.05]">
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
            <li key={sym}>
              <Link href={`/chart?symbol=${encodeURIComponent(sym)}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2.5 transition-colors hover:bg-white/[0.035] active:bg-cyan-400/[0.06]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-tos-text">{sym}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${supportClass}`}>
                    {item?.supportLabel ?? "Awaiting broker map"}
                  </span>
                </div>
                {item?.brokerSymbol && item.brokerSymbol !== sym ? (
                  <p className="mt-0.5 text-[10px] text-tos-dim">Broker: {item.brokerSymbol}</p>
                ) : null}
              </div>
              <div className="grid min-w-[6.8rem] gap-0.5 text-right">
                <span className="font-mono text-[12px] font-semibold text-cyan-100/95">{formatBrokerPrice(item?.brokerSymbol ?? sym, item?.bid)}</span>
                <span className="font-mono text-[12px] font-semibold text-rose-100/95">{formatBrokerPrice(item?.brokerSymbol ?? sym, item?.ask)}</span>
              </div>
              <div className="grid min-w-[4.4rem] gap-0.5 text-right">
                <span className="font-mono text-[10px] text-tos-muted">{formatBrokerPrice(item?.brokerSymbol ?? sym, item?.spread)}</span>
                <span className="font-mono text-[10px] text-tos-dim">{item?.freshness ? new Date(item.freshness).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
              </div>
              </Link>
            </li>
            );
          })}
        </ul>
      </GlassPanel>

      <GlassPanel className="p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">Edit watchlist</h2>
        <p className="mt-1 text-xs text-tos-muted">Add or remove clean symbols. Runtime quotes resolve through the active MT5 account.</p>
        <div className="mt-3">
          <WatchlistManager items={items} />
        </div>
      </GlassPanel>
    </div>
  );
}
