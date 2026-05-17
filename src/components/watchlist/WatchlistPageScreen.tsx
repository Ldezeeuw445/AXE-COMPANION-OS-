import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { WatchlistManager } from "@/components/settings/WatchlistManager";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";

type Row = { id: string; symbol: string; message: string | null };

const DEFAULTS = ["XAUUSD", "EURUSD", "BTCUSD"];

type Props = {
  items: Row[];
};

export function WatchlistPageScreen({ items }: Props) {
  const merged = [...new Set([...items.map((i) => i.symbol), ...DEFAULTS])];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-2">
      <LiveStatusReporter
        liveCount={0}
        totalCount={0}
        label={`Watchlist · ${items.length} saved`}
        allLiveOverride={null}
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
          {merged.map((sym) => (
            <li key={sym} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <span className="font-mono text-sm text-tos-text">{sym}</span>
              <div className="flex gap-2 text-[11px]">
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
          ))}
        </ul>
      </GlassPanel>
    </div>
  );
}
