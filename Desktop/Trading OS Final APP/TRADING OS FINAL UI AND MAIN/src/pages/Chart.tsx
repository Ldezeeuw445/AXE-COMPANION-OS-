// ============================================================================
// CHART PAGE — Full trading terminal (lightweight-charts + panels + API)
// ============================================================================
// Backend: set VITE_TRADING_TERMINAL_API_URL (e.g. http://127.0.0.1:8000).
// Symbol sync: global pair (default XAU/USD) ↔ terminal keys (XAUUSD) via bridge.
// Same chart path as Engine Ops when VITE_USE_ENGINE_EDGE=true (getTradingAdapter().getChart).
// If candles fail to load, clear tradingos.activeSymbol in localStorage or pick XAU/USD from the watchlist.
// ============================================================================

import { useEffect, useMemo } from 'react';
import TradingTerminal from '@/features/trading-terminal/components/TradingTerminal.jsx';
import { useSymbol } from '@/contexts/SymbolContext';
import { useTerminalWatchlist } from '@/contexts/WatchlistContext';
import { fromTerminalSymbol, toTerminalSymbol } from '@/lib/terminalSymbolBridge';

/** Mirrors GlobalTopBar watchlist normalization: same symbols as SymbolContext (slash pairs). */
function ChartTerminalWatchlistSlot() {
  const { flatSymbols } = useTerminalWatchlist();
  const { symbol, setSymbol } = useSymbol();
  const tabs = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of flatSymbols) {
      const display = fromTerminalSymbol(toTerminalSymbol(raw));
      if (!display || seen.has(display)) continue;
      seen.add(display);
      out.push(display);
      if (out.length >= 24) break;
    }
    return out;
  }, [flatSymbols]);

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto scrollbar-hide">
      <span className="text-[9px] font-bold uppercase tracking-widest text-white/20 shrink-0">Watchlist</span>
      {tabs.map((d) => {
        const active = symbol === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => setSymbol(d)}
            className={`px-2 py-0.5 rounded whitespace-nowrap text-[9px] transition-all shrink-0 ${
              active
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25'
                : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

export default function ChartPage() {
  const { symbol, setSymbol } = useSymbol();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('[ChartPage] symbol', symbol, '→ terminal', toTerminalSymbol(symbol));
    }
  }, [symbol]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0B0E14]">
      <TradingTerminal
        externalSymbol={toTerminalSymbol(symbol)}
        onSymbolChange={(terminalSym: string) => setSymbol(fromTerminalSymbol(terminalSym))}
        initialPanelState={{ left: true, right: true, execution: false }}
        watchlistSlot={<ChartTerminalWatchlistSlot />}
      />
    </div>
  );
}
