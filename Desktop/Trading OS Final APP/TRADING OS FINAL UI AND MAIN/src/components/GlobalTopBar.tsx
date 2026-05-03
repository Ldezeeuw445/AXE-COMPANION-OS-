import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, DollarSign, Activity,
  Volume2, Play,
} from 'lucide-react';
import { useSymbol } from '../contexts/SymbolContext';
import { useBeginner } from '@/lib/beginnerMode';
import { useTerminalWatchlist } from '@/contexts/WatchlistContext';
import { fromTerminalSymbol, toTerminalSymbol } from '@/lib/terminalSymbolBridge';

/**
 * GLOBAL TOP BAR — Fixed on EVERY page
 *
 * Layout (2 rows):
 *   Row 1: MAIN | Total Net Worth | SQUAWK + BREAKING (compact) | All/Accounts/Wallets | USD/EUR | BEGINNER | Synced
 *   Row 2: Watchlist symbol tabs (scrollable)
 */

export default function GlobalTopBar() {
  const navigate = useNavigate();
  const { symbol, setSymbol } = useSymbol();
  const { beginner, toggle } = useBeginner();
  const { flatSymbols } = useTerminalWatchlist();

  const watchlistTabs = useMemo(() => {
    const seen = new Set<string>();
    const cap: string[] = [];
    for (const raw of flatSymbols) {
      const display = fromTerminalSymbol(toTerminalSymbol(raw));
      if (!display || seen.has(display)) continue;
      seen.add(display);
      cap.push(display);
      if (cap.length >= 28) break;
    }
    return { tabs: ['ALL', ...cap] as string[] };
  }, [flatSymbols]);

  return (
    <div className="flex-shrink-0 bg-[#0d0d0d] border-b border-white/[0.04]">
      {/* ═══════════════════════════════════════════
          ROW 1: Desktop only (hidden on mobile < 768px)
         ═══════════════════════════════════════════ */}
      <div className="hidden md:flex items-center justify-between px-4 py-1.5">
        {/* Left: MAIN badge + Total Net Worth */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <LayoutDashboard size={14} className="text-white/50" />
            <span className="text-[10px] text-white/40 px-1.5 py-0.5 bg-white/5 rounded border border-white/[0.06]">MAIN</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <DollarSign size={12} className="text-cyan-400" />
              <span className="tos-block-title">TOTAL NET WORTH</span>
            </div>
            <span className="text-base font-semibold text-white/90 tabular-nums">$100,000</span>
            <span className="text-[10px] text-green-400/80">Trading Accounts: $100,000</span>
            <span className="text-[10px] text-white/30">Wallets: $0</span>
          </div>
        </div>

        {/* Center: SQUAWK + BREAKING */}
        <div className="flex items-center flex-1 mx-4 min-w-0">
          <div className="flex items-center gap-2 px-3 py-1 border-l border-r border-white/[0.04] shrink-0">
            <Volume2 size={12} className="text-cyan-400" />
            <span className="text-[10px] font-semibold text-cyan-400">SQUAWK</span>
            <span className="text-[10px] text-white/30">IDLE</span>
            <span className="text-[10px] text-white/40">Press play to start squawk feed</span>
            <button className="w-5 h-5 rounded bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors ml-1">
              <Play size={10} />
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 min-w-0 flex-1">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-[10px] font-semibold text-red-400 tracking-wide shrink-0">BREAKING</span>
            <div className="overflow-hidden relative flex-1">
              <div className="whitespace-nowrap text-[10px] text-white/50 animate-marquee">
                FED signals potential rate cut in June meeting &middot; Oil prices surge 3% amid Middle East tensions &middot; ECB holds rates steady &middot; Bitcoin breaks $75K resistance &middot; JPMorgan earnings beat estimates
              </div>
            </div>
          </div>
        </div>

        {/* Right: Filters + Currency + BEGINNER + Synced */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 mr-1">
            {['All', 'Accounts', 'Wallets'].map((f) => (
              <button
                key={f}
                onClick={() => {/* TODO: Filter main dashboard by account/wallet view */}}
                className="px-2 py-0.5 rounded text-[9px] text-white/40 hover:text-white/60 hover:bg-white/[0.05] border border-transparent transition-all"
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 mr-1">
            {['USD', 'EUR'].map(c => (
              <button
                key={c}
                onClick={() => {/* TODO: Set display currency */}}
                className={`px-1.5 py-0.5 rounded text-[9px] transition-all ${
                  c === 'USD' ? 'bg-white/10 text-white/70' : 'text-white/40 hover:text-white/60'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <button
            className={`btn-dark px-3 py-1.5 rounded text-[10px] flex items-center gap-1.5 ${
              beginner ? 'border border-cyan-500/25 bg-cyan-500/10 text-cyan-200' : ''
            }`}
            onClick={toggle}
            title="Toggle Beginner Mode"
          >
            <Activity size={11} />
            BEGINNER
          </button>
          <div
            className="hidden lg:flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-white/45"
            title="Tip: press ⌘K (or Ctrl+K) for Command Palette"
          >
            <span className="text-white/30">⌘K</span>
            <span className="text-white/25">Command</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-white/35" title="Market data path">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                import.meta.env.VITE_USE_ENGINE_EDGE === 'true' ? 'bg-emerald-500 shadow-[0_0_4px_#10b981]' : 'bg-white/25'
              }`}
            />
            <span className="text-white/45">{import.meta.env.VITE_USE_ENGINE_EDGE === 'true' ? 'Edge' : 'Local'}</span>
            {String(import.meta.env.VITE_LIVE_ENGINE_WS_URL ?? '').trim() ? (
              <span className="text-cyan-500/70">· WS</span>
            ) : (
              <span className="text-white/20">· no WS</span>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          ROW 2: Watchlist tabs (all devices)
          Mobile: larger touch targets
         ═══════════════════════════════════════════ */}
      <div className="flex items-center gap-1 px-3 md:px-4 py-1 border-t border-white/[0.03] overflow-x-auto scrollbar-hide">
        {watchlistTabs.tabs.map((tab) => {
          const isActive = tab === 'ALL' ? symbol === 'XAU/USD' : symbol === tab;
          return (
            <button
              key={tab}
              onClick={() => setSymbol(tab === 'ALL' ? 'XAU/USD' : tab)}
              className={`px-2.5 md:px-2 py-1 md:py-0.5 rounded whitespace-nowrap transition-all text-[10px] md:text-[9px] ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>
    </div>
  );
}
