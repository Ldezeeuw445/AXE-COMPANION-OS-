import { useEffect, useMemo, useState } from 'react';
import {
  Grid3x3,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  Droplets,
  ChevronUp,
  ChevronDown,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  X,
} from 'lucide-react';
import { PageBeginnerBanner } from '@/lib/beginnerMode';
import { heatmapMarketSnapshot } from '@/lib/engineAdapter';

type HeatmapCategory = 'ALL' | 'FX' | 'Metals' | 'Energy' | 'Indices' | 'Crypto';
type HeatmapTab = 'market' | 'treemap' | 'liquidity';
type TreemapMarket = 'US30' | 'NAS100' | 'Crypto';

interface HeatmapItem {
  symbol: string;
  label: string;
  category: HeatmapCategory;
  change: number;
  price: number;
  volume: 'high' | 'avg' | 'low';
}

interface TreemapItem {
  symbol: string;
  label: string;
  change: number;
  marketCap: number;
  sector?: string;
}

interface LiquidityLevel {
  price: number;
  volume: number;
  side: 'bid' | 'ask';
  symbol: string;
}

const CATEGORY_TABS: HeatmapCategory[] = ['ALL', 'FX', 'Metals', 'Energy', 'Indices', 'Crypto'];
const HEATMAP_TABS: { id: HeatmapTab; label: string; icon: any }[] = [
  { id: 'market', label: 'Market Heatmap', icon: Grid3x3 },
  { id: 'treemap', label: 'Treemap', icon: LayoutGrid },
  { id: 'liquidity', label: 'Liquidity', icon: Droplets },
];
const TREEMAP_TABS: { id: TreemapMarket; label: string }[] = [
  { id: 'US30', label: 'Dow Jones 30' },
  { id: 'NAS100', label: 'Nasdaq 100' },
  { id: 'Crypto', label: 'Crypto' },
];

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateHeatmapData(): HeatmapItem[] {
  const items: { symbol: string; label: string; category: HeatmapCategory; basePrice: number }[] = [
    { symbol: 'EURUSD', label: 'EUR/USD', category: 'FX', basePrice: 1.0845 },
    { symbol: 'GBPUSD', label: 'GBP/USD', category: 'FX', basePrice: 1.2634 },
    { symbol: 'USDJPY', label: 'USD/JPY', category: 'FX', basePrice: 149.82 },
    { symbol: 'AUDUSD', label: 'AUD/USD', category: 'FX', basePrice: 0.6543 },
    { symbol: 'USDCAD', label: 'USD/CAD', category: 'FX', basePrice: 1.3567 },
    { symbol: 'NZDUSD', label: 'NZD/USD', category: 'FX', basePrice: 0.6123 },
    { symbol: 'USDCHF', label: 'USD/CHF', category: 'FX', basePrice: 0.8765 },
    { symbol: 'EURGBP', label: 'EUR/GBP', category: 'FX', basePrice: 0.8582 },
    { symbol: 'XAUUSD', label: 'Gold', category: 'Metals', basePrice: 2342.5 },
    { symbol: 'XAGUSD', label: 'Silver', category: 'Metals', basePrice: 27.85 },
    { symbol: 'USOIL', label: 'WTI Oil', category: 'Energy', basePrice: 78.45 },
    { symbol: 'UKOIL', label: 'Brent Oil', category: 'Energy', basePrice: 82.3 },
    { symbol: 'SPX500', label: 'S&P 500', category: 'Indices', basePrice: 5234.18 },
    { symbol: 'NAS100', label: 'Nasdaq', category: 'Indices', basePrice: 18456.32 },
    { symbol: 'US30', label: 'Dow Jones', category: 'Indices', basePrice: 39127.8 },
    { symbol: 'BTCUSD', label: 'Bitcoin', category: 'Crypto', basePrice: 67234.5 },
    { symbol: 'ETHUSD', label: 'Ethereum', category: 'Crypto', basePrice: 3456.78 },
    { symbol: 'SOLUSD', label: 'Solana', category: 'Crypto', basePrice: 145.23 },
    { symbol: 'XRPUSD', label: 'XRP', category: 'Crypto', basePrice: 0.5234 },
  ];
  const day = Math.floor(Date.now() / 86400000);
  return items.map((item, i) => {
    const r = seededRandom(day * 100 + i);
    const change = (r - 0.45) * 6;
    const volumes: Array<'high' | 'avg' | 'low'> = ['high', 'avg', 'low'];
    return {
      symbol: item.symbol,
      label: item.label,
      category: item.category,
      change: Math.round(change * 100) / 100,
      price: Math.round(item.basePrice * (1 + change / 100) * 100) / 100,
      volume: volumes[Math.floor(seededRandom(day * 200 + i) * 3)],
    };
  });
}

function generateTreemapData(market: TreemapMarket): TreemapItem[] {
  const day = Math.floor(Date.now() / 86400000);
  const datasets: Record<TreemapMarket, { symbol: string; label: string; marketCap: number; sector?: string }[]> = {
    US30: [
      { symbol: 'AAPL', label: 'Apple', marketCap: 3200, sector: 'Tech' },
      { symbol: 'MSFT', label: 'Microsoft', marketCap: 3100, sector: 'Tech' },
      { symbol: 'AMZN', label: 'Amazon', marketCap: 1900, sector: 'Consumer' },
      { symbol: 'JPM', label: 'JPMorgan', marketCap: 580, sector: 'Finance' },
      { symbol: 'JNJ', label: 'J&J', marketCap: 420, sector: 'Health' },
      { symbol: 'WMT', label: 'Walmart', marketCap: 520, sector: 'Consumer' },
      { symbol: 'CVX', label: 'Chevron', marketCap: 290, sector: 'Energy' },
    ],
    NAS100: [
      { symbol: 'AAPL', label: 'Apple', marketCap: 3200, sector: 'Tech' },
      { symbol: 'MSFT', label: 'Microsoft', marketCap: 3100, sector: 'Tech' },
      { symbol: 'NVDA', label: 'NVIDIA', marketCap: 2800, sector: 'Semis' },
      { symbol: 'AMZN', label: 'Amazon', marketCap: 1900, sector: 'Consumer' },
      { symbol: 'META', label: 'Meta', marketCap: 1300, sector: 'Tech' },
      { symbol: 'GOOGL', label: 'Alphabet', marketCap: 2100, sector: 'Tech' },
    ],
    Crypto: [
      { symbol: 'BTC', label: 'Bitcoin', marketCap: 1340 },
      { symbol: 'ETH', label: 'Ethereum', marketCap: 420 },
      { symbol: 'BNB', label: 'BNB', marketCap: 90 },
      { symbol: 'SOL', label: 'Solana', marketCap: 65 },
      { symbol: 'XRP', label: 'XRP', marketCap: 30 },
    ],
  };
  return (datasets[market] || []).map((item, i) => ({
    ...item,
    change: Math.round((seededRandom(day * 300 + i + market.charCodeAt(0)) - 0.45) * 8 * 100) / 100,
  }));
}

function generateLiquidityData(symbol: string): LiquidityLevel[] {
  const day = Math.floor(Date.now() / 86400000);
  const levels: LiquidityLevel[] = [];
  const basePrice =
    symbol === 'XAUUSD'
      ? 2342
      : symbol === 'NAS100'
        ? 18456
        : symbol === 'US30'
          ? 39127
          : symbol === 'BTCUSD'
            ? 67234
            : 1.0845;
  const step = basePrice > 1000 ? basePrice * 0.001 : basePrice * 0.002;
  for (let i = 0; i < 15; i++) {
    const bidPrice = Math.round((basePrice - step * (i + 1)) * 100) / 100;
    const askPrice = Math.round((basePrice + step * (i + 1)) * 100) / 100;
    const bidVol = Math.round(seededRandom(day * 400 + i) * 100);
    const askVol = Math.round(seededRandom(day * 500 + i) * 100);
    levels.push({ price: bidPrice, volume: bidVol, side: 'bid', symbol });
    levels.push({ price: askPrice, volume: askVol, side: 'ask', symbol });
  }
  return levels.sort((a, b) => b.price - a.price);
}

function getHeatBg(change: number): string {
  if (change >= 3) return 'from-emerald-500/50 to-emerald-600/30';
  if (change >= 1.5) return 'from-emerald-500/35 to-emerald-600/20';
  if (change >= 0.5) return 'from-emerald-500/20 to-emerald-600/10';
  if (change >= 0.05) return 'from-emerald-500/10 to-emerald-600/5';
  if (change <= -3) return 'from-red-500/50 to-red-600/30';
  if (change <= -1.5) return 'from-red-500/35 to-red-600/20';
  if (change <= -0.5) return 'from-red-500/20 to-red-600/10';
  if (change <= -0.05) return 'from-red-500/10 to-red-600/5';
  return 'from-white/[0.03] to-white/[0.01]';
}

function getHeatBorder(change: number): string {
  if (change >= 1.5) return 'border-emerald-400/25';
  if (change >= 0.05) return 'border-emerald-500/10';
  if (change <= -1.5) return 'border-red-400/25';
  if (change <= -0.05) return 'border-red-500/10';
  return 'border-white/[0.04]';
}

function getChangeColor(change: number): string {
  if (change >= 0.05) return 'text-emerald-400';
  if (change <= -0.05) return 'text-red-400';
  return 'text-white/70';
}

function getTreemapBg(change: number): string {
  if (change >= 3) return 'from-emerald-600/90 to-emerald-700/70';
  if (change >= 1) return 'from-emerald-600/70 to-emerald-700/50';
  if (change >= 0) return 'from-emerald-700/40 to-emerald-800/30';
  if (change >= -1) return 'from-red-700/40 to-red-800/30';
  if (change >= -3) return 'from-red-600/70 to-red-700/50';
  return 'from-red-600/90 to-red-700/70';
}

function PremiumPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3.5 py-[7px] rounded-lg text-[10px] font-semibold tracking-wide transition-all duration-200
        ${active
          ? 'bg-gradient-to-b from-white/[0.12] to-white/[0.04] text-white border border-white/[0.15] shadow-[0_1px_8px_rgba(255,255,255,0.04)]'
          : 'bg-white/[0.02] text-white/60 border border-white/[0.04] hover:text-white/50 hover:bg-white/[0.04]'}`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: 'green' | 'red' | 'neutral' }) {
  const styles = {
    green: 'bg-gradient-to-b from-emerald-500/[0.08] to-emerald-600/[0.03] border-emerald-500/[0.12]',
    red: 'bg-gradient-to-b from-red-500/[0.08] to-red-600/[0.03] border-red-500/[0.12]',
    neutral: 'bg-gradient-to-b from-white/[0.04] to-white/[0.01] border-white/[0.06]',
  };
  const textColors = { green: 'text-emerald-400', red: 'text-red-400', neutral: 'text-white/70' };
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-center ${styles[color]}`}>
      <div className="text-[8px] text-white/60 uppercase tracking-[0.12em] font-medium mb-0.5">{label}</div>
      <div className={`text-[15px] font-bold tabular-nums ${textColors[color]}`}>{value}</div>
    </div>
  );
}

function RankingList({
  items,
  sortAsc,
  onToggleSort,
}: {
  items: { rank: number; symbol: string; label: string; change: number; extra?: string }[];
  sortAsc: boolean;
  onToggleSort: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-white/[0.05] bg-gradient-to-b from-white/[0.02] to-transparent overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
        <span className="text-[10px] text-white/60 uppercase tracking-[0.1em] font-semibold">Performance Ranking</span>
        <button
          onClick={onToggleSort}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[9px] text-white/70 font-medium hover:text-white/60 hover:bg-white/[0.05] transition-all"
        >
          {sortAsc ? <ArrowUpWideNarrow className="h-3 w-3" /> : <ArrowDownWideNarrow className="h-3 w-3" />}
          {sortAsc ? 'Worst first' : 'Best first'}
        </button>
      </div>
      <div className="divide-y divide-white/[0.03]">
        {items.map((item) => (
          <div
            key={item.symbol}
            className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.02] transition-colors"
          >
            <span className="text-[10px] text-white/60 font-mono w-5 text-right tabular-nums">{item.rank}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-white/80">{item.symbol}</span>
                <span className="text-[9px] text-white/60 truncate">{item.label}</span>
              </div>
            </div>
            {item.extra ? <span className="text-[9px] text-white/60 font-mono shrink-0">{item.extra}</span> : null}
            <div className="flex items-center gap-1 shrink-0 min-w-[65px] justify-end">
              {item.change >= 0.05 ? (
                <ChevronUp className="h-3 w-3 text-emerald-400/60" />
              ) : item.change <= -0.05 ? (
                <ChevronDown className="h-3 w-3 text-red-400/60" />
              ) : null}
              <span className={`text-[11px] font-bold font-mono tabular-nums ${getChangeColor(item.change)}`}>
                {item.change >= 0 ? '+' : ''}
                {item.change.toFixed(2)}%
              </span>
            </div>
            <div className="w-16 h-1.5 rounded-full bg-white/[0.04] overflow-hidden shrink-0">
              <div
                className={`h-full rounded-full transition-all ${item.change >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60'}`}
                style={{ width: `${Math.min(Math.abs(item.change) * 15, 100)}%`, marginLeft: item.change < 0 ? 'auto' : 0 }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketHeatmapView() {
  const [activeCategory, setActiveCategory] = useState<HeatmapCategory>('ALL');
  const [listSortAsc, setListSortAsc] = useState(false);
  const [allData, setAllData] = useState<HeatmapItem[]>(() => generateHeatmapData());
  const [heatmapDataMode, setHeatmapDataMode] = useState<'scanner' | 'seed'>('seed');

  useEffect(() => {
    let alive = true;
    heatmapMarketSnapshot([])
      .then((rows) => {
        if (!alive || rows.length === 0) return;
        setAllData(
          rows.map((r) => ({
            symbol: r.symbol,
            label: r.label,
            category: r.category as HeatmapItem['category'],
            change: r.change,
            price: r.price,
            volume: r.volume,
          })),
        );
        setHeatmapDataMode('scanner');
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const items = activeCategory === 'ALL' ? allData : allData.filter((d) => d.category === activeCategory);
    return [...items].sort((a, b) => b.change - a.change);
  }, [allData, activeCategory]);

  const gainers = allData.filter((d) => d.change > 0).length;
  const losers = allData.filter((d) => d.change < 0).length;
  const avgChange = allData.reduce((sum, d) => sum + d.change, 0) / allData.length;

  const rankedList = useMemo(() => {
    const sorted = listSortAsc ? [...filtered].sort((a, b) => a.change - b.change) : filtered;
    return sorted.map((item, i) => ({
      rank: i + 1,
      symbol: item.symbol,
      label: item.label,
      change: item.change,
      extra: item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    }));
  }, [filtered, listSortAsc]);

  return (
    <div className="space-y-4">
      {heatmapDataMode === 'scanner' ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-[10px] text-emerald-200/90">
          Market grid: live via engineAdapter.heatmapMarketSnapshot → getScannerResults.
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Gainers" value={String(gainers)} color="green" />
        <StatCard label="Losers" value={String(losers)} color="red" />
        <StatCard
          label="Avg Change"
          value={`${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`}
          color={avgChange >= 0 ? 'green' : 'red'}
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        {CATEGORY_TABS.map((cat) => (
          <PremiumPill key={cat} active={activeCategory === cat} onClick={() => setActiveCategory(cat)}>
            {cat === 'ALL' ? 'All' : cat}
          </PremiumPill>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-[6px]">
        {filtered.map((item) => (
          <div
            key={item.symbol}
            role="button"
            tabIndex={0}
            className={`group relative rounded-xl border bg-gradient-to-b ${getHeatBg(item.change)} ${getHeatBorder(item.change)} p-3 transition-all duration-200 hover:scale-[1.015] hover:shadow-lg cursor-pointer overflow-hidden`}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-bold text-white/90 tracking-tight">{item.label}</span>
                {item.change > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-400/50" />
                ) : item.change < 0 ? (
                  <TrendingDown className="h-3.5 w-3.5 text-red-400/50" />
                ) : null}
              </div>
              <div className="text-[9px] text-white/60 font-mono tracking-wider mb-2">{item.symbol}</div>
              <div className="flex items-center justify-between">
                <span className={`text-[14px] font-bold font-mono tabular-nums tracking-tight ${getChangeColor(item.change)}`}>
                  {item.change >= 0 ? '+' : ''}
                  {item.change.toFixed(2)}%
                </span>
                <span
                  className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-md tracking-wider ${
                    item.volume === 'high'
                      ? 'bg-amber-400/10 text-amber-400/60 border border-amber-400/10'
                      : item.volume === 'avg'
                        ? 'bg-white/[0.04] text-white/60 border border-white/[0.04]'
                        : 'bg-white/[0.02] text-white/60 border border-white/[0.02]'
                  }`}
                >
                  {item.volume === 'high' ? 'HIGH' : item.volume === 'avg' ? 'AVG' : 'LOW'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <RankingList items={rankedList} sortAsc={listSortAsc} onToggleSort={() => setListSortAsc((v) => !v)} />
    </div>
  );
}

function TreemapView() {
  const [activeMarket, setActiveMarket] = useState<TreemapMarket>('US30');
  const [listSortAsc, setListSortAsc] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const data = useMemo(() => generateTreemapData(activeMarket), [activeMarket]);
  const totalCap = data.reduce((s, d) => s + d.marketCap, 0);
  const sorted = useMemo(() => [...data].sort((a, b) => b.marketCap - a.marketCap), [data]);

  const gainers = data.filter((d) => d.change > 0).length;
  const losers = data.filter((d) => d.change < 0).length;
  const avgChange = data.reduce((sum, d) => sum + d.change, 0) / data.length;

  const rankedList = useMemo(() => {
    const byChange = [...data].sort((a, b) => (listSortAsc ? a.change - b.change : b.change - a.change));
    return byChange.map((item, i) => ({
      rank: i + 1,
      symbol: item.symbol,
      label: item.label,
      change: item.change,
      extra: item.sector || '',
    }));
  }, [data, listSortAsc]);

  const rows = useMemo(() => {
    const result: TreemapItem[][] = [];
    let current: TreemapItem[] = [];
    let currentWeight = 0;
    sorted.forEach((item) => {
      const w = item.marketCap / totalCap;
      if (currentWeight + w > 0.55 && current.length > 0) {
        result.push(current);
        current = [item];
        currentWeight = w;
      } else {
        current.push(item);
        currentWeight += w;
      }
    });
    if (current.length > 0) result.push(current);
    return result;
  }, [sorted, totalCap]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Gainers" value={String(gainers)} color="green" />
        <StatCard label="Losers" value={String(losers)} color="red" />
        <StatCard
          label="Avg Change"
          value={`${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`}
          color={avgChange >= 0 ? 'green' : 'red'}
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        {TREEMAP_TABS.map((tab) => (
          <PremiumPill key={tab.id} active={activeMarket === tab.id} onClick={() => setActiveMarket(tab.id)}>
            {tab.label}
          </PremiumPill>
        ))}
      </div>

      <div className="space-y-[3px] rounded-xl overflow-hidden border border-white/[0.05]">
        {rows.map((row, ri) => {
          const rowTotal = row.reduce((s, d) => s + d.marketCap, 0);
          return (
            <div key={ri} className="flex gap-[3px]" style={{ height: ri === 0 ? '110px' : ri === 1 ? '85px' : '65px' }}>
              {row.map((item) => {
                const pct = (item.marketCap / rowTotal) * 100;
                const isLarge = pct > 20;
                return (
                  <div
                    key={item.symbol}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSymbol((prev) => (prev === item.symbol ? null : item.symbol))}
                    className={`group relative bg-gradient-to-br ${getTreemapBg(item.change)} border-r border-white/[0.03] last:border-r-0 cursor-pointer hover:brightness-125 transition-all duration-200 flex flex-col justify-between p-2 overflow-hidden ${
                      selectedSymbol === item.symbol ? 'ring-1 ring-white/20' : ''
                    }`}
                    style={{ width: `${pct}%`, minWidth: '32px' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    <div className="relative z-10">
                      <div className={`font-bold text-white/90 leading-none truncate ${isLarge ? 'text-[13px]' : 'text-[10px]'}`}>
                        {item.symbol}
                      </div>
                      {isLarge ? <div className="text-[8px] text-white/60 mt-0.5 truncate">{item.label}</div> : null}
                    </div>
                    <div className={`relative z-10 font-bold font-mono tabular-nums text-white/75 ${isLarge ? 'text-[12px]' : 'text-[9px]'}`}>
                      {item.change >= 0 ? '+' : ''}
                      {item.change.toFixed(2)}%
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {selectedSymbol ? (
        <div className="rounded-xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-white/90 font-mono">{selectedSymbol}</div>
              <div className="text-[9px] text-white/40 mt-0.5">Fundamentals panel can be wired later.</div>
            </div>
            <button onClick={() => setSelectedSymbol(null)} className="text-white/30 hover:text-white/60 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      <RankingList items={rankedList} sortAsc={listSortAsc} onToggleSort={() => setListSortAsc((v) => !v)} />
    </div>
  );
}

function LiquidityView({ contextSymbol }: { contextSymbol?: string }) {
  const activeSymbol = contextSymbol?.trim() ?? '';
  const levels = useMemo(() => (activeSymbol ? generateLiquidityData(activeSymbol) : []), [activeSymbol]);
  const maxVol = levels.length ? Math.max(...levels.map((l) => l.volume)) : 0;

  if (!activeSymbol) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center">
        <p className="text-[11px] text-white/45 leading-relaxed max-w-sm mx-auto">
          Liquidity demo anchors to your workspace symbol. Select a pair, then reopen Heatmaps.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/[0.05] bg-gradient-to-b from-white/[0.02] to-transparent overflow-hidden">
        <div className="grid grid-cols-[1fr_90px_1fr] gap-0 px-4 py-2.5 border-b border-white/[0.04]">
          <span className="text-[9px] text-emerald-400/30 font-semibold uppercase tracking-[0.1em] text-right pr-3">Bid Volume</span>
          <span className="text-[9px] text-white/60 font-semibold uppercase tracking-[0.1em] text-center">Price Level</span>
          <span className="text-[9px] text-red-400/30 font-semibold uppercase tracking-[0.1em] pl-3">Ask Volume</span>
        </div>
        <div className="divide-y divide-white/[0.02]">
          {levels.map((level, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_1fr] gap-0 items-center px-4 py-[5px] hover:bg-white/[0.015] transition-colors">
              <div className="flex justify-end pr-3">
                {level.side === 'bid' ? (
                  <div className="flex items-center gap-2 w-full justify-end">
                    <span className="text-[10px] text-emerald-400/50 font-mono tabular-nums">{level.volume}M</span>
                    <div className="h-[6px] rounded-full bg-gradient-to-l from-emerald-500/40 to-emerald-500/10" style={{ width: `${(level.volume / maxVol) * 100}%`, minWidth: '3px' }} />
                  </div>
                ) : null}
              </div>
              <div className="text-center">
                <span className={`text-[10px] font-mono font-medium tabular-nums ${level.side === 'bid' ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                  {level.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="pl-3">
                {level.side === 'ask' ? (
                  <div className="flex items-center gap-2">
                    <div className="h-[6px] rounded-full bg-gradient-to-r from-red-500/40 to-red-500/10" style={{ width: `${(level.volume / maxVol) * 100}%`, minWidth: '3px' }} />
                    <span className="text-[10px] text-red-400/50 font-mono tabular-nums">{level.volume}M</span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HeatmapPage({ contextSymbol }: { contextSymbol?: string }) {
  const [activeTab, setActiveTab] = useState<HeatmapTab>('market');

  return (
    <div className="space-y-5 pb-8">
      <PageBeginnerBanner widgetKey="heatmap" />
      <div className="flex items-center gap-3.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.08] flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
          <Grid3x3 className="h-4 w-4 text-white/60" />
        </div>
        <div>
          <h1 className="text-[15px] font-bold text-white/90 tracking-tight">Heatmaps</h1>
          <p className="text-[10px] text-white/60 tracking-wide">Market performance, treemaps & liquidity depth</p>
        </div>
      </div>

      <div className="flex items-center gap-0 rounded-xl border border-white/[0.05] bg-white/[0.015] p-[3px] overflow-x-auto scrollbar-hide">
        {HEATMAP_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-[9px] text-[10px] font-semibold tracking-wide transition-all duration-200 whitespace-nowrap ${
                isActive
                  ? 'bg-gradient-to-b from-white/[0.1] to-white/[0.04] text-white shadow-[0_1px_6px_rgba(255,255,255,0.03)] border border-white/[0.08]'
                  : 'text-white/60 hover:text-white/70 border border-transparent'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'market' ? <MarketHeatmapView /> : null}
      {activeTab === 'treemap' ? <TreemapView /> : null}
      {activeTab === 'liquidity' ? <LiquidityView contextSymbol={contextSymbol} /> : null}

      <div className="text-center pt-2" />
    </div>
  );
}

