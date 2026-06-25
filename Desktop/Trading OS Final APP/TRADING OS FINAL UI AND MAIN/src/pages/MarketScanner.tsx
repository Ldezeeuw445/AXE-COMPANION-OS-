import { useState, useEffect, useMemo } from 'react';
import { ScanLine, Plus, Search, ArrowUpRight, ArrowDownRight, Play, Pause } from 'lucide-react';
import { useSymbol } from '@/contexts/SymbolContext';
import { scannerRun } from '../lib/engineAdapter';
import type { ScannerResult } from '../lib/engineAdapter';

// ── Filter templates ──
const FILTER_TEMPLATES = [
  'RSI OB/OS', 'Volume Spike', 'EMA Cross', 'MACD Cross', 'Bollinger Squeeze',
  'Key Level Proximity', 'Funding Rate', 'Price Above/Below EMA200',
  'Volume > 2x Avg', '24h Change > 5%', 'ATR Expansion', 'Liquidity Grab',
  'Golden Cross', 'Death Cross', 'Divergence', 'Consolidation Break',
];

const PRESETS = [
  'Oversold Bounce', 'Trend Follow', 'Breakout Watch', 'Mean Reversion', 'Crypto Funding Edge',
];

const CAT_COLORS: Record<string, string> = {
  FX: 'cyan', Crypto: 'purple', Indices: 'blue', Metals: 'yellow', Energy: 'orange', Bonds: 'green',
};

const CAT_OPTIONS = ['Forex', 'Crypto', 'Indices', 'Metals', 'Energy', 'Bonds'];

// ── Mini sparkline for table rows ──
function RowSpark({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 60},${20 - ((v - min) / range) * 20}`).join(' ');
  return (
    <svg width="60" height="20" className="opacity-80">
      <polyline points={pts} fill="none" stroke={positive ? '#22c55e' : '#ef4444'} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ── Skeleton loader ──
function SkeletonRow() {
  return (
    <tr className="border-b border-white/[0.03]">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-2 py-2">
          <div className="h-3 bg-white/[0.04] rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

export default function MarketScanner() {
  const { symbol: globalSymbol } = useSymbol();
  const [preset, setPreset] = useState('Oversold Bounce');
  const [activeFilters, setActiveFilters] = useState<string[]>(['RSI OB/OS']);
  const [matchMode, setMatchMode] = useState<'any' | 'all'>('any');
  const [activeCats, setActiveCats] = useState<string[]>(['Forex', 'Crypto', 'Indices', 'Metals', 'Energy']);
  const [search, setSearch] = useState('');
  const [scanInterval, setScanInterval] = useState('30s');

  useEffect(() => {
    setSearch(globalSymbol);
  }, [globalSymbol]);
  const [running, setRunning] = useState(true);
  const [results, setResults] = useState<ScannerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const data = await scannerRun(activeFilters, matchMode, activeCats);
      if (mounted) {
        setResults(data);
        setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [activeFilters, matchMode, activeCats]);

  // Auto-scan timer
  useEffect(() => {
    if (!running) return;
    const ms: number = scanInterval === '10s' ? 10000 : scanInterval === '30s' ? 30000 : scanInterval === '1m' ? 60000 : 300000;
    const timer = setInterval(() => {
      scannerRun(activeFilters, matchMode, activeCats).then(setResults);
    }, ms);
    return () => clearInterval(timer);
  }, [running, scanInterval, activeFilters, matchMode, activeCats]);

  const toggleFilter = (f: string) => {
    setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  const toggleCat = (c: string) => {
    setActiveCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const filtered = useMemo(() => {
    let out = results;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(r => r.symbol.toLowerCase().includes(q));
    }
    if (sortCol) {
      out = [...out].sort((a, b) => {
        let va: number, vb: number;
        switch (sortCol) {
          case 'PRICE': va = a.price; vb = b.price; break;
          case '24H%': va = a.change24h; vb = b.change24h; break;
          case 'RSI': va = a.rsi; vb = b.rsi; break;
          case 'VOLx': va = a.volumeX; vb = b.volumeX; break;
          default: return 0;
        }
        return sortAsc ? va - vb : vb - va;
      });
    }
    return out;
  }, [results, search, sortCol, sortAsc]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <span className="text-white/20 ml-0.5">&#8597;</span>;
    return sortAsc ? <ArrowUpRight size={9} className="text-cyan-400 ml-0.5" /> : <ArrowDownRight size={9} className="text-cyan-400 ml-0.5" />;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ScanLine size={14} className="text-cyan-400" />
            <span className="text-[10px] text-white/40 px-1.5 py-0.5 bg-white/5 rounded">SCANNER</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running
            ? <span className="text-[9px] text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Scanning</span>
            : <span className="text-[9px] text-white/30">Paused</span>
          }
          <button onClick={() => setRunning(!running)} className="w-5 h-5 rounded bg-white/5 flex items-center justify-center hover:bg-white/10">
            {running ? <Pause size={10} /> : <Play size={10} />}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* ── Presets ── */}
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button key={p} onClick={() => setPreset(p)} className={`symbol-tag text-[10px] ${preset === p ? 'active' : ''}`}>{p}</button>
          ))}
        </div>

        {/* ── Filter templates ── */}
        <div className="tos-card rounded-lg overflow-hidden p-3">
          <div className="flex items-center gap-2 mb-2">
            <Plus size={10} className="text-cyan-400" />
            <span className="text-[10px] text-white/40 uppercase tracking-wider">FILTERS</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {FILTER_TEMPLATES.map(f => (
              <button key={f} onClick={() => toggleFilter(f)} className={`symbol-tag text-[9px] ${activeFilters.includes(f) ? 'active' : ''}`}>{f}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMatchMode('any')} className={`symbol-tag text-[9px] ${matchMode === 'any' ? 'active' : ''}`}>Match Any</button>
            <button onClick={() => setMatchMode('all')} className={`symbol-tag text-[9px] ${matchMode === 'all' ? 'active' : ''}`}>Match All</button>
            <span className="text-[9px] text-white/30 ml-2">Interval:</span>
            {['10s', '30s', '1m', '5m'].map(i => (
              <button key={i} onClick={() => setScanInterval(i)} className={`symbol-tag text-[9px] ${scanInterval === i ? 'active' : ''}`}>{i}</button>
            ))}
          </div>
        </div>

        {/* ── Category toggles + Search ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {CAT_OPTIONS.map(c => {
            const color = CAT_COLORS[c] || 'cyan';
            const active = activeCats.includes(c);
            return (
              <button key={c} onClick={() => toggleCat(c)} className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium border transition-all ${active ? `border-${color}-500/30 text-${color}-400 bg-${color}-500/10` : 'border-white/[0.05] text-white/30 hover:text-white/50'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${active ? `bg-${color}-500` : 'bg-white/10'}`} />
                {c}
              </button>
            );
          })}
          <div className="flex-1 min-w-[180px]" />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.03] border border-white/[0.06] focus-within:border-cyan-500/30 transition-colors">
            <Search size={10} className="text-white/30" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol..." className="bg-transparent text-[10px] text-white/70 placeholder:text-white/25 outline-none w-32" />
          </div>
        </div>

        {/* ── Results Table ── */}
        <div className="tos-card rounded-lg overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {[
                    ['SYMBOL', 'SYMBOL'],
                    ['PRICE', 'PRICE'],
                    ['24H%', '24H%'],
                    ['RSI', 'RSI'],
                    ['VOLx', 'VOLx'],
                    ['KLV', 'KLV'],
                    ['SPARKLINE', 'SPARKLINE'],
                    ['ACTIONS', 'ACTIONS'],
                  ].map(([key, label]) => (
                    <th key={key} onClick={() => ['PRICE', '24H%', 'RSI', 'VOLx'].includes(key) ? toggleSort(key) : undefined}
                      className={`px-2 py-2 text-left text-[9px] text-white/40 uppercase tracking-wider font-medium ${['PRICE', '24H%', 'RSI', 'VOLx'].includes(key) ? 'cursor-pointer hover:text-white/60' : ''}`}>
                      <span className="flex items-center">{label}{['PRICE', '24H%', 'RSI', 'VOLx'].includes(key) && <SortIcon col={key} />}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-white/30">No symbols match your filters</td></tr>
                ) : (
                  filtered.map((r, i) => (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                      <td className="px-2 py-2">
                        <span className="text-[10px] font-semibold text-white/80">{r.symbol}</span>
                        {r.matchedFilters.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {r.matchedFilters.map(f => (
                              <span key={f} className="text-[7px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400/70 border border-cyan-500/20">{f}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-white/70 tabular-nums">{r.price.toFixed(r.price < 10 ? 4 : 2)}</td>
                      <td className={`px-2 py-2 tabular-nums ${r.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {r.change24h >= 0 ? '+' : ''}{r.change24h.toFixed(2)}%
                      </td>
                      <td className={`px-2 py-2 tabular-nums ${r.rsi > 70 ? 'text-red-400' : r.rsi < 30 ? 'text-green-400' : 'text-white/50'}`}>{r.rsi.toFixed(1)}</td>
                      <td className={`px-2 py-2 tabular-nums ${r.volumeX >= 2 ? 'text-cyan-400' : 'text-white/50'}`}>{r.volumeX.toFixed(1)}x</td>
                      <td className="px-2 py-2 text-white/50">{r.klv}</td>
                      <td className="px-2 py-2"><RowSpark data={r.sparkline} positive={r.change24h >= 0} /></td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="btn-cyan text-[8px] px-2 py-0.5 rounded">Chart</button>
                          <button className="btn-dark text-[8px] px-2 py-0.5 rounded">Alert</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
