import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSymbol } from '../contexts/SymbolContext';
import { jetIconTone, useJetAlerts } from '@/lib/jetAlerts';
import { useTerminalWatchlist } from '@/contexts/WatchlistContext';
import { fromTerminalSymbol, toTerminalSymbol } from '@/lib/terminalSymbolBridge';

type TickerRow = { symbol: string; price: string; change: string };

const fallbackTickers: TickerRow[] = [
  { symbol: 'Nasdaq 100', price: '18,456.32', change: '+0.45%' },
  { symbol: 'GBP/USD', price: '1.2645', change: '+0.12%' },
  { symbol: 'Ethereum', price: '2,375.61', change: '+0.03%' },
  { symbol: 'XRP', price: '1.57', change: '+0.02%' },
  { symbol: 'Dow Jones', price: '38,765.21', change: '-0.08%' },
  { symbol: 'FTSE 100', price: '7,945.12', change: '+0.15%' },
  { symbol: 'Platinum', price: '945.20', change: '+0.32%' },
  { symbol: 'WTI Crude', price: '68.45', change: '+0.47%' },
  { symbol: 'Brent Crude', price: '72.18', change: '+0.57%' },
  { symbol: 'US 2-Year', price: '3.81', change: '+0.00%' },
  { symbol: 'EUR/USD', price: '1.0842', change: '-0.11%' },
  { symbol: 'Gold', price: '2,341.20', change: '+0.54%' },
  { symbol: 'Bitcoin', price: '74,400.76', change: '+0.04%' },
];

export default function TickerBar() {
  const navigate = useNavigate();
  const { recentSymbols, setSymbol } = useSymbol();
  const { flatSymbols } = useTerminalWatchlist();
  const { alerts } = useJetAlerts(60_000);

  // Later: replace this adapter with one-source-of-truth engine snapshot.
  const tickers = useMemo<TickerRow[]>(() => {
    const wl = (flatSymbols || []).slice(0, 12);
    const fromWatchlist = wl.map((sym, i) => ({
      symbol: sym,
      price: '—',
      change: i % 3 === 0 ? '+0.00%' : i % 3 === 1 ? '+0.00%' : '-0.00%',
    }));
    const recents = (recentSymbols || []).slice(0, 4);
    const synthetic = recents.map((sym, i) => ({
      symbol: sym,
      price: '—',
      change: i % 2 === 0 ? '+0.00%' : '-0.00%',
    }));
    // Watchlist first, then recents, then macro fallbacks so the ribbon always looks full.
    const mixed = [...fromWatchlist, ...synthetic, ...fallbackTickers].slice(0, 16);
    return mixed.length ? mixed : fallbackTickers;
  }, [flatSymbols, recentSymbols]);

  // Duplicate list for seamless marquee loop.
  const loop = useMemo(() => [...tickers, ...tickers], [tickers]);

  const onTickerClick = (label: string) => {
    const raw = String(label || '').trim();
    if (!raw) return;
    if (raw.includes('/')) {
      setSymbol(raw);
      navigate('/chart');
      return;
    }
    if (flatSymbols.includes(raw)) {
      setSymbol(fromTerminalSymbol(toTerminalSymbol(raw)));
      navigate('/chart');
    }
  };

  return (
    <div className="h-7 flex items-center overflow-hidden bg-[rgba(8,8,8,0.95)] border-b border-white/[0.03] shrink-0">
      <div className="flex items-center whitespace-nowrap animate-marquee">
        {loop.map((t, i) => (
          <div
            key={`${t.symbol}-${i}`}
            role="presentation"
            onClick={() => onTickerClick(t.symbol)}
            className="flex items-center gap-1.5 px-3 py-1 border-r border-white/5 text-[9px] hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <span className="text-white/50 flex items-center gap-1">
              <span>{t.symbol}</span>
              {alerts[String(t.symbol).toUpperCase()] ? (
                <span
                  className={[
                    'ml-0.5 inline-flex items-center justify-center rounded-sm',
                    'text-[10px] leading-none',
                    jetIconTone(alerts[String(t.symbol).toUpperCase()].severity).fg,
                    jetIconTone(alerts[String(t.symbol).toUpperCase()].severity).glow,
                  ].join(' ')}
                  title={`Jet alert: ${alerts[String(t.symbol).toUpperCase()].reason || 'Unusual activity'}`}
                >
                  ✈︎
                </span>
              ) : null}
            </span>
            <span className="text-white/70 tabular-nums">{t.price}</span>
            <span className={t.change.startsWith('+') ? 'text-green-400/80' : 'text-red-400/80'}>
              {t.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
