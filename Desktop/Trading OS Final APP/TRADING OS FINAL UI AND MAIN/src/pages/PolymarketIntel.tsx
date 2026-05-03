import { useEffect, useMemo, useState } from 'react';
import { Search, TrendingUp } from 'lucide-react';
import { gammaPublicSearch, normalizeSearchMarkets, formatTimeRemaining } from '@/lib/engineAdapter';

type PolymarketImpact = 'bullish' | 'bearish' | 'neutral';
type PolymarketCategory = 'macro' | 'crypto' | 'geopolitics' | 'earnings' | 'rates' | 'commodity';
type Sentiment = 'bullish' | 'bearish' | 'neutral';

type Market = {
  id: string;
  question: string;
  probability: number; // 0..1
  volume: number;
  timeRemaining: string;
  impact: PolymarketImpact;
  category: PolymarketCategory;
  trend: number[];
};

type WatchAsset = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  sentiment: Sentiment;
  markets: Market[];
};

type NewsItem = {
  source: string;
  time: string;
  title: string;
  pair: string;
  sentiment: 'positive' | 'negative' | 'neutral';
};

type Catalyst = {
  date: string;
  event: string;
  prob: string;
  asset: string;
  color: 'green' | 'red' | 'amber' | 'blue';
};

const MOCK_WATCHLIST: WatchAsset[] = [
  {
    symbol: 'XAUUSD',
    name: 'Gold',
    price: 3078.45,
    change: +1.24,
    sentiment: 'bullish',
    markets: [
      { id: 'xau1', question: 'Will Gold (GC) hit $4,300 by end of March?', probability: 0.28, volume: 310000, timeRemaining: '3d 8h', impact: 'bullish', category: 'commodity', trend: [0.15, 0.18, 0.22, 0.25, 0.30, 0.27, 0.28] },
      { id: 'xau2', question: 'Gold above $4,000 end of March?', probability: 0.96, volume: 1250000, timeRemaining: '3d 8h', impact: 'bullish', category: 'commodity', trend: [0.88, 0.9, 0.92, 0.94, 0.95, 0.96, 0.96] },
      { id: 'xau3', question: 'Gold settles between $2,900–$3,100 end of March?', probability: 0.41, volume: 780000, timeRemaining: '3d 8h', impact: 'neutral', category: 'commodity', trend: [0.52, 0.48, 0.45, 0.44, 0.42, 0.41, 0.41] },
      { id: 'xau4', question: 'Fed holds rates at April FOMC meeting?', probability: 0.96, volume: 4200000, timeRemaining: '10d 6h', impact: 'bullish', category: 'rates', trend: [0.91, 0.93, 0.94, 0.95, 0.96, 0.96, 0.96] },
    ],
  },
  {
    symbol: 'BTCUSD',
    name: 'Bitcoin',
    price: 87248.3,
    change: -2.18,
    sentiment: 'neutral',
    markets: [
      { id: 'btc1', question: 'Will Bitcoin hit $100,000 by end of March?', probability: 0.18, volume: 8900000, timeRemaining: '3d 8h', impact: 'bullish', category: 'crypto', trend: [0.35, 0.3, 0.25, 0.22, 0.2, 0.19, 0.18] },
      { id: 'btc2', question: 'Bitcoin above $80,000 end of March?', probability: 0.82, volume: 5400000, timeRemaining: '3d 8h', impact: 'bullish', category: 'crypto', trend: [0.9, 0.88, 0.85, 0.83, 0.82, 0.82, 0.82] },
      { id: 'btc6', question: 'How many Fed rate cuts in 2026? (Zero)', probability: 0.4, volume: 6700000, timeRemaining: '279d 0h', impact: 'bearish', category: 'rates', trend: [0.32, 0.34, 0.36, 0.38, 0.39, 0.4, 0.4] },
    ],
  },
  {
    symbol: 'NAS100',
    name: 'Nasdaq 100',
    price: 19912.75,
    change: -0.87,
    sentiment: 'bearish',
    markets: [
      { id: 'nas1', question: 'US recession in 2026? (2 consecutive quarters GDP decline)', probability: 0.35, volume: 12400000, timeRemaining: '279d 0h', impact: 'bearish', category: 'macro', trend: [0.22, 0.25, 0.28, 0.3, 0.32, 0.34, 0.35] },
      { id: 'nas3', question: 'NVIDIA earnings beat Q1 2026 estimates?', probability: 0.72, volume: 2800000, timeRemaining: '58d 0h', impact: 'bullish', category: 'earnings', trend: [0.68, 0.69, 0.7, 0.71, 0.71, 0.72, 0.72] },
      { id: 'nas4', question: 'S&P 500 closes below 5,000 before May?', probability: 0.28, volume: 4500000, timeRemaining: '34d 8h', impact: 'bearish', category: 'macro', trend: [0.15, 0.18, 0.2, 0.23, 0.25, 0.27, 0.28] },
    ],
  },
  {
    symbol: 'EURUSD',
    name: 'Euro/Dollar',
    price: 1.0792,
    change: +0.32,
    sentiment: 'neutral',
    markets: [
      { id: 'eur1', question: 'ECB cuts rates at April meeting?', probability: 0.74, volume: 2100000, timeRemaining: '20d 0h', impact: 'bearish', category: 'rates', trend: [0.6, 0.63, 0.66, 0.69, 0.72, 0.73, 0.74] },
      { id: 'eur2', question: 'EU retaliatory tariffs on US goods by May?', probability: 0.48, volume: 1500000, timeRemaining: '34d 8h', impact: 'bearish', category: 'geopolitics', trend: [0.35, 0.38, 0.4, 0.43, 0.45, 0.47, 0.48] },
    ],
  },
  {
    symbol: 'USOIL',
    name: 'Crude Oil',
    price: 69.42,
    change: -1.53,
    sentiment: 'bearish',
    markets: [
      { id: 'oil3', question: 'Strait of Hormuz blockade or disruption by June?', probability: 0.12, volume: 3400000, timeRemaining: '95d 0h', impact: 'bullish', category: 'geopolitics', trend: [0.08, 0.09, 0.1, 0.11, 0.11, 0.12, 0.12] },
      { id: 'oil4', question: 'OPEC+ extends production cuts past June 2026?', probability: 0.68, volume: 2800000, timeRemaining: '95d 0h', impact: 'bullish', category: 'commodity', trend: [0.6, 0.62, 0.64, 0.65, 0.66, 0.67, 0.68] },
      { id: 'oil5', question: 'US Strategic Petroleum Reserve purchase announced Q2?', probability: 0.31, volume: 900000, timeRemaining: '95d 0h', impact: 'bullish', category: 'macro', trend: [0.25, 0.26, 0.28, 0.29, 0.3, 0.31, 0.31] },
    ],
  },
];

const MOCK_NEWS: NewsItem[] = [
  { source: 'Reuters', time: '12m ago', title: 'Gold surges past $3,075 as safe-haven demand intensifies amid tariff concerns', pair: 'XAUUSD', sentiment: 'positive' },
  { source: 'Bloomberg', time: '28m ago', title: 'Bitcoin drops below $88K as risk-off sentiment grips crypto markets', pair: 'BTCUSD', sentiment: 'negative' },
  { source: 'CNBC', time: '35m ago', title: "Fed's Waller signals patience on rate cuts, sees inflation risks from tariffs", pair: 'NAS100', sentiment: 'negative' },
  { source: 'FT', time: '41m ago', title: 'Iran nuclear talks stall as IAEA reports enrichment above agreed limits', pair: 'XAUUSD', sentiment: 'positive' },
  { source: 'WSJ', time: '52m ago', title: 'Crude oil slides on demand fears as China manufacturing PMI disappoints', pair: 'USOIL', sentiment: 'negative' },
  { source: 'Polymarket', time: '1h ago', title: '$12.4M wagered on 2026 US recession market — probability rises to 35%', pair: 'NAS100', sentiment: 'negative' },
];

const MOCK_CATALYSTS: Catalyst[] = [
  { date: 'Mar 28', event: 'Gold March Futures Settle', prob: '96% > $4K', asset: 'XAUUSD', color: 'green' },
  { date: 'Mar 31', event: 'Q1 2026 Ends — Recession Clock', prob: '35% recession', asset: 'NAS100', color: 'red' },
  { date: 'Apr 2', event: 'Trump Tariff Deadline (EU)', prob: '58% implements', asset: 'EURUSD', color: 'amber' },
  { date: 'Apr 7', event: 'ECB Rate Decision', prob: '74% cut', asset: 'EURUSD', color: 'blue' },
  { date: 'Apr 9', event: 'FOMC Decision + Press Conference', prob: '96% no change', asset: 'BTCUSD', color: 'blue' },
  { date: 'Jun 15', event: 'Strait of Hormuz Review', prob: '12% disruption', asset: 'USOIL', color: 'amber' },
];

function formatVolume(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const WATCH_QUERIES: Array<{
  symbol: string;
  name: string;
  query: string;
  categoryHint: PolymarketCategory;
}> = [
  { symbol: 'XAUUSD', name: 'Gold', query: 'gold', categoryHint: 'commodity' },
  { symbol: 'BTCUSD', name: 'Bitcoin', query: 'bitcoin', categoryHint: 'crypto' },
  { symbol: 'NAS100', name: 'Nasdaq 100', query: 'recession', categoryHint: 'macro' },
  { symbol: 'EURUSD', name: 'Euro/Dollar', query: 'ecb rate', categoryHint: 'rates' },
  { symbol: 'USOIL', name: 'Crude Oil', query: 'crude oil', categoryHint: 'commodity' },
];

function TrendSparkline({ data, color }: { data: number[]; color: 'green' | 'red' | 'amber' }) {
  const w = 48;
  const h = 18;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const stroke =
    color === 'green' ? '#22c55e' : color === 'red' ? '#ef4444' : '#eab308';

  return (
    <svg className="h-[18px] w-[48px]" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}

export default function PolymarketIntel() {
  const [assetFilter, setAssetFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'relevance' | 'volume' | 'probability' | 'time'>('relevance');
  const [search, setSearch] = useState<string>('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now());
  const [liveAssets, setLiveAssets] = useState<WatchAsset[] | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  // keep "updated" feeling like the zip
  useEffect(() => {
    const t = window.setInterval(() => setLastUpdatedAt(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Gamma API poll (public, no key). Uses dev proxy to avoid CORS.
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    async function load() {
      try {
        setLiveError(null);
        const results = await Promise.all(
          WATCH_QUERIES.map(async (w) => {
            const resp = await gammaPublicSearch(w.query, 12, { signal: ac.signal });
            const markets = normalizeSearchMarkets(resp.markets).slice(0, 8);
            const mapped: Market[] = markets.map((m, idx) => ({
              id: `${w.symbol}-${idx}-${String((m.raw as any)?.id ?? (m.raw as any)?.slug ?? m.question).slice(0, 32)}`,
              question: m.question,
              probability: m.probability,
              volume: m.volume,
              timeRemaining: formatTimeRemaining(m.endDate),
              impact: m.probability >= 0.6 ? 'bullish' : m.probability <= 0.4 ? 'bearish' : 'neutral',
              category: w.categoryHint,
              trend: [m.probability, m.probability, m.probability, m.probability, m.probability, m.probability, m.probability],
            }));

            const bullish = mapped.filter((x) => x.impact === 'bullish').length;
            const bearish = mapped.filter((x) => x.impact === 'bearish').length;
            const sentiment: Sentiment =
              bullish > bearish + 1 ? 'bullish' : bearish > bullish + 1 ? 'bearish' : 'neutral';

            return {
              symbol: w.symbol,
              name: w.name,
              price: MOCK_WATCHLIST.find((x) => x.symbol === w.symbol)?.price ?? 0,
              change: MOCK_WATCHLIST.find((x) => x.symbol === w.symbol)?.change ?? 0,
              sentiment,
              markets: mapped,
            } satisfies WatchAsset;
          })
        );
        if (!alive) return;
        setLiveAssets(results);
        setLastUpdatedAt(Date.now());
      } catch (e: any) {
        if (!alive) return;
        if (e?.name === 'AbortError') return;
        setLiveError(String(e?.message || e));
        setLiveAssets(null);
      }
    }

    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
      ac.abort();
    };
  }, []);

  const assets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const src = liveAssets ?? MOCK_WATCHLIST;
    const base = src.filter((a) => (assetFilter === 'all' ? true : a.symbol === assetFilter));

    return base
      .map((a) => {
        let markets = [...a.markets];
        if (categoryFilter !== 'all') markets = markets.filter((m) => m.category === categoryFilter);
        if (q) markets = markets.filter((m) => m.question.toLowerCase().includes(q));

        if (sortBy === 'volume') markets.sort((x, y) => y.volume - x.volume);
        else if (sortBy === 'probability') markets.sort((x, y) => y.probability - x.probability);
        // time sort intentionally omitted in mock (needs parsing)

        return { ...a, markets };
      })
      .filter((a) => a.markets.length > 0);
  }, [assetFilter, categoryFilter, sortBy, search]);

  const totalMarkets = useMemo(() => {
    const src = liveAssets ?? MOCK_WATCHLIST;
    return src.reduce((sum, a) => sum + a.markets.length, 0);
  }, [liveAssets]);
  const totalVolume = useMemo(() => {
    const src = liveAssets ?? MOCK_WATCHLIST;
    return src.reduce((sum, a) => sum + a.markets.reduce((s2, m) => s2 + m.volume, 0), 0);
  }, [liveAssets]);

  const news = useMemo(() => {
    if (assetFilter === 'all') return MOCK_NEWS;
    return MOCK_NEWS.filter((n) => n.pair === assetFilter);
  }, [assetFilter]);

  const assetPills = useMemo(() => {
    const src = liveAssets ?? MOCK_WATCHLIST;
    return ['all', ...src.map((a) => a.symbol)];
  }, [liveAssets]);
  const categories: Array<{ id: PolymarketCategory; label: string }> = [
    { id: 'macro', label: 'Macro' },
    { id: 'crypto', label: 'Crypto' },
    { id: 'geopolitics', label: 'Geopolitics' },
    { id: 'earnings', label: 'Earnings' },
    { id: 'rates', label: 'Rates' },
    { id: 'commodity', label: 'Commodity' },
  ];

  const lastUpdated = useMemo(() => {
    const mins = Math.max(1, Math.round((Date.now() - lastUpdatedAt) / 60_000));
    return mins === 1 ? '1 min ago' : `${mins} min ago`;
  }, [lastUpdatedAt]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
      {/* Zip-like header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-cyan-400" />
          <span className="text-[10px] text-white/40 px-1.5 py-0.5 bg-white/5 rounded border border-white/[0.06]">
            POLYMARKET SENTIMENT
          </span>
        </div>
        <div className="flex items-end flex-col gap-0.5">
          <div className="text-[8px] uppercase tracking-wider text-white/20">LAST UPDATED</div>
            <div className={cls('text-[10px] font-semibold tabular-nums', liveError ? 'text-red-400' : 'text-green-400')}>
              {liveError ? 'offline (fallback)' : lastUpdated}
            </div>
        </div>
      </div>

      <div className="border-b border-cyan-500/20 bg-cyan-500/5 px-4 py-1.5 text-[10px] text-cyan-100/90">
        Search uses live Gamma REST via `engineAdapter` exports. KPI strip + watchlist cards are still PLACEHOLDER demo numbers.
      </div>

      <div className="p-4 space-y-3">
        {/* KPI strip (zip layout, MAIN/INTEL styling) */}
        <div className="grid grid-cols-5 gap-2">
          <div className="tos-card rounded-lg p-3">
            <div className="text-[9px] text-white/30 uppercase tracking-wider">Market Sentiment</div>
            <div className="mt-1 text-[20px] font-bold text-green-400 tabular-nums">58</div>
            <div className="mt-0.5 text-[9px] text-white/35">Bullish bias</div>
            <div className="mt-2 h-1 rounded bg-white/[0.05] overflow-hidden">
              <div className="h-full bg-green-500/70" style={{ width: '58%' }} />
            </div>
          </div>
          <div className="tos-card rounded-lg p-3">
            <div className="text-[9px] text-white/30 uppercase tracking-wider">Bullish / Bearish</div>
            <div className="mt-1 text-[20px] font-bold text-white/80 tabular-nums">
              12 <span className="text-white/20">/</span> 7
            </div>
            <div className="mt-0.5 text-[9px] text-white/35">4 neutral</div>
            <div className="mt-2 h-1 rounded bg-white/[0.05] overflow-hidden">
              <div className="h-full bg-green-500/70" style={{ width: '63%' }} />
            </div>
          </div>
          <div className="tos-card rounded-lg p-3">
            <div className="text-[9px] text-white/30 uppercase tracking-wider">Total Volume</div>
            <div className="mt-1 text-[20px] font-bold text-cyan-300 tabular-nums">{formatVolume(totalVolume)}</div>
            <div className="mt-0.5 text-[9px] text-white/35">Across all markets</div>
          </div>
          <div className="tos-card rounded-lg p-3">
            <div className="text-[9px] text-white/30 uppercase tracking-wider">Active Markets</div>
            <div className="mt-1 text-[20px] font-bold text-white/80 tabular-nums">{totalMarkets}</div>
            <div className="mt-0.5 text-[9px] text-white/35">{MOCK_WATCHLIST.length} watchlist pairs</div>
          </div>
          <div className="tos-card rounded-lg p-3">
            <div className="text-[9px] text-white/30 uppercase tracking-wider">Last Updated</div>
            <div className="mt-1 text-[16px] font-bold text-white/70 tabular-nums">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="mt-0.5 text-[9px] text-white/35">
              {new Date().toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Filter / control bar (zip layout) */}
        <div className="tos-card rounded-lg p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="text-[8px] uppercase tracking-wider text-white/20">Asset</div>
              <div className="flex flex-wrap gap-1">
                {assetPills.map((sym) => (
                  <button
                    key={sym}
                    onClick={() => setAssetFilter(sym)}
                    className={cls(
                      'px-2 py-1 rounded text-[10px] font-semibold border transition-colors',
                      assetFilter === sym
                        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25'
                        : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03] border-white/[0.06]'
                    )}
                  >
                    {sym === 'all' ? 'All' : sym}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="text-[8px] uppercase tracking-wider text-white/20">Category</div>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={cls(
                    'px-2 py-1 rounded text-[10px] font-semibold border transition-colors',
                    categoryFilter === 'all'
                      ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03] border-white/[0.06]'
                  )}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategoryFilter(c.id)}
                    className={cls(
                      'px-2 py-1 rounded text-[10px] font-semibold border transition-colors',
                      categoryFilter === c.id
                        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25'
                        : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03] border-white/[0.06]'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="text-[8px] uppercase tracking-wider text-white/20">Sort by</div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-[10px] text-white/70 outline-none"
              >
                <option value="relevance">Relevance</option>
                <option value="volume">Volume</option>
                <option value="probability">Probability</option>
                <option value="time">Time Remaining</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5 ml-auto">
              <div className="text-[8px] uppercase tracking-wider text-white/20">Search</div>
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.02] border border-white/[0.06]">
                <Search size={10} className="text-white/25" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search markets..."
                  className="bg-transparent text-[10px] text-white/70 placeholder:text-white/25 outline-none w-48"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Main layout (zip: predictions + news sidebar) */}
        <div className="grid grid-cols-[1fr_340px] gap-3">
          <div className="tos-card rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between">
              <div className="tos-block-title">WATCHLIST-MATCHED PREDICTIONS</div>
              <div className="text-[9px] text-white/25 tabular-nums">{assets.length} assets</div>
            </div>
            <div className="p-3 space-y-4 max-h-[calc(100vh-380px)] overflow-y-auto custom-scrollbar">
              {assets.map((a) => (
                <div key={a.symbol} className="space-y-0">
                  <div className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div className="text-[12px] font-bold text-white/80 font-mono">{a.symbol}</div>
                    <div className="text-[11px] text-white/45 font-mono tabular-nums">
                      {a.symbol === 'EURUSD' ? a.price.toFixed(4) : a.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className={cls('text-[10px] font-semibold font-mono', a.change >= 0 ? 'text-green-400' : 'text-red-400')}>
                      {a.change >= 0 ? '+' : ''}
                      {a.change.toFixed(2)}%
                    </div>
                    <div className="ml-auto flex items-center gap-1.5 text-[10px] font-bold uppercase font-mono">
                      <span
                        className={cls(
                          'h-2 w-2 rounded-full',
                          a.sentiment === 'bullish' ? 'bg-green-500' : a.sentiment === 'bearish' ? 'bg-red-500' : 'bg-yellow-500'
                        )}
                      />
                      <span className={cls(a.sentiment === 'bullish' ? 'text-green-400' : a.sentiment === 'bearish' ? 'text-red-400' : 'text-yellow-400')}>
                        {a.sentiment}
                      </span>
                    </div>
                  </div>

                  <div className="divide-y divide-white/[0.04] rounded-b-md border border-t-0 border-white/[0.06] overflow-hidden">
                    {a.markets.map((m) => {
                      const oddsClass = m.probability >= 0.65 ? 'text-green-400' : m.probability >= 0.35 ? 'text-yellow-400' : 'text-red-400';
                      const barColor = m.impact === 'bullish' ? 'bg-green-500/70' : m.impact === 'bearish' ? 'bg-red-500/70' : 'bg-yellow-500/70';
                      const sparkColor = m.trend[m.trend.length - 1] > m.trend[0] + 0.02 ? 'green' : m.trend[m.trend.length - 1] < m.trend[0] - 0.02 ? 'red' : 'amber';

                      return (
                        <div key={m.id} className="px-3 py-2 hover:bg-white/[0.02] transition-colors cursor-pointer">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-[11px] text-white/80 leading-snug">{m.question}</div>
                            <div className={cls('text-[12px] font-bold font-mono tabular-nums shrink-0', oddsClass)}>
                              {Math.round(m.probability * 100)}%
                              <span className="text-[10px] font-normal text-white/35"> Yes</span>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-1 w-[110px] rounded bg-white/[0.05] overflow-hidden">
                              <div className={cls('h-full rounded', barColor)} style={{ width: `${Math.round(m.probability * 100)}%` }} />
                            </div>
                            <div className="text-[9px] text-white/35 font-mono">
                              <span className="text-[8px] uppercase tracking-wider text-white/20 font-sans mr-1.5">VOL</span>
                              {formatVolume(m.volume)}
                            </div>
                            <div className="text-[9px] text-white/35 font-mono">
                              <span className="text-[8px] uppercase tracking-wider text-white/20 font-sans mr-1.5">EXP</span>
                              {m.timeRemaining}
                            </div>
                            <span className={cls('text-[8px] font-bold font-mono uppercase px-1.5 py-0.5 rounded border', m.impact === 'bullish'
                              ? 'text-green-400 border-green-500/20 bg-green-500/10'
                              : m.impact === 'bearish'
                                ? 'text-red-400 border-red-500/20 bg-red-500/10'
                                : 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10')}>
                              {m.impact}
                            </span>
                            <span className="text-[8px] font-bold font-mono uppercase px-1.5 py-0.5 rounded border border-cyan-500/15 bg-cyan-500/10 text-cyan-300">
                              {m.category}
                            </span>
                            <div className="ml-auto opacity-90">
                              <TrendSparkline data={m.trend} color={sparkColor as any} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="tos-card rounded-lg overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between">
              <div className="tos-block-title">Market News</div>
              <div className="text-[9px] text-white/25 tabular-nums">{news.length} articles</div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {news.map((n, i) => (
                <div key={i} className="px-3 py-2 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 text-[9px] font-mono text-white/25 uppercase">
                    <span>{n.source}</span>
                    <span className="text-white/15">·</span>
                    <span className="normal-case text-white/25">{n.time}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-white/70 leading-snug">{n.title}</div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-[8px] font-bold font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/15">
                      {n.pair}
                    </span>
                    <span
                      className={cls(
                        'text-[8px] font-bold font-mono uppercase px-1.5 py-0.5 rounded border',
                        n.sentiment === 'positive'
                          ? 'text-green-400 border-green-500/20 bg-green-500/10'
                          : n.sentiment === 'negative'
                            ? 'text-red-400 border-red-500/20 bg-red-500/10'
                            : 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10'
                      )}
                    >
                      {n.sentiment}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* Catalyst / timeline (zip) */}
        <div className="tos-card rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-white/[0.05] flex items-baseline justify-between gap-3">
            <div>
              <div className="tos-block-title">Catalyst Timeline</div>
              <div className="mt-0.5 text-[10px] text-white/25">Upcoming events linked to prediction markets</div>
            </div>
          </div>
          <div className="p-3 overflow-x-auto custom-scrollbar">
            <div className="flex items-center min-w-max">
              {MOCK_CATALYSTS.map((c, i) => (
                <div key={`${c.asset}-${i}`} className="relative flex flex-col items-center px-4">
                  <div className="absolute top-4 left-0 right-0 h-px bg-white/[0.06]" aria-hidden />
                  <div
                    className={cls(
                      'relative z-10 h-3 w-3 rounded-full border-2 bg-[#0b0b0f]',
                      c.color === 'green'
                        ? 'border-green-400/80'
                        : c.color === 'red'
                          ? 'border-red-400/80'
                          : c.color === 'blue'
                            ? 'border-cyan-300/80'
                            : 'border-yellow-400/80'
                    )}
                  />
                  <div className="mt-2 text-[9px] font-mono text-white/45">{c.date}</div>
                  <div className="mt-1 text-[10px] text-white/70 text-center max-w-[130px] leading-snug">{c.event}</div>
                  <div
                    className={cls(
                      'mt-1 text-[9px] font-bold font-mono',
                      c.color === 'green'
                        ? 'text-green-400'
                        : c.color === 'red'
                          ? 'text-red-400'
                          : c.color === 'blue'
                            ? 'text-cyan-300'
                            : 'text-yellow-400'
                    )}
                  >
                    {c.prob}
                  </div>
                  <span className="mt-1 text-[8px] font-bold font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/15">
                    {c.asset}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-[10px] text-white/20 flex items-center justify-between px-1">
          <span>Data sourced from Polymarket prediction markets. For informational purposes only.</span>
          <span className="text-white/15">TradingOS</span>
        </div>
      </div>
    </div>
  );
}
