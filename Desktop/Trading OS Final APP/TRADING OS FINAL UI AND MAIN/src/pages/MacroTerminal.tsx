import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, TrendingUp, TrendingDown, Minus, ExternalLink,
  LayoutDashboard, Percent, Flame, TrendingUp as GrowthIcon,
  Users, ShieldAlert, Activity, Globe,
} from 'lucide-react';
import {
  macroSeries,
  isMacroFeedLive,
  getMacroFeedRefreshedSecondsAgo,
  getMacroFeedLastError,
} from '../lib/engineAdapter';
import type { MacroSeries } from '../lib/engineAdapter';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface RegimeInfo {
  label: string;
  color: string;
  description: string;
}

// ─────────────────────────────────────────────────────────────
// TAB CONFIG
// ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, key: '1' },
  { id: 'rates', label: 'Rates', icon: Percent, key: '2' },
  { id: 'inflation', label: 'Inflation', icon: Flame, key: '3' },
  { id: 'growth', label: 'Growth', icon: GrowthIcon, key: '4' },
  { id: 'labor', label: 'Labor', icon: Users, key: '5' },
  { id: 'risk', label: 'Risk', icon: ShieldAlert, key: '6' },
];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatValue(v: number | undefined, decimals: number): string {
  if (v === undefined || v === null) return '\u2014';
  return v.toFixed(decimals);
}

function calcDelta(history: number[], periods = 5): number | null {
  if (!history || history.length < periods + 1) return null;
  const recent = history[history.length - 1];
  const prior = history[history.length - 1 - periods];
  return recent - prior;
}

function getRegime(data: MacroSeries[]): RegimeInfo {
  const cpi = data.find(d => d.id === 'CPIAUCSL');
  const unrate = data.find(d => d.id === 'UNRATE');
  const fed = data.find(d => d.id === 'FEDFUNDS');

  if (!cpi || !unrate || !fed) {
    return { label: 'Loading...', color: 'text-white/30', description: '' };
  }

  const cpiHigh = cpi.value > 3.0;
  const unrateHigh = unrate.value > 4.5;
  const fedTight = fed.value > 4.0;

  if (cpiHigh && unrateHigh) {
    return {
      label: 'STAGFLATION RISK',
      color: 'text-amber-400',
      description: 'Elevated inflation with rising unemployment and tight monetary policy. The Fed faces a policy dilemma between fighting inflation and supporting growth.',
    };
  }
  if (fedTight && !unrateHigh) {
    return {
      label: 'LATE CYCLE',
      color: 'text-orange-400',
      description: 'Tight policy with still-resilient employment. Watch for yield curve inversion and credit spread widening as harbingers of recession.',
    };
  }
  if (!cpiHigh && fedTight) {
    return {
      label: 'DISINFLATION',
      color: 'text-cyan-400',
      description: 'Falling inflation allows the Fed to consider rate cuts. Risk assets typically benefit in this regime. Monitor for premature easing.',
    };
  }
  if (!cpiHigh && !fedTight) {
    return {
      label: 'GOLDILOCKS',
      color: 'text-green-400',
      description: 'Low inflation with supportive policy. Growth is sustainable. Best regime for risk assets.',
    };
  }
  return { label: 'TRANSITION', color: 'text-white/50', description: 'Mixed signals. Macro regime is unclear.' };
}

// ─────────────────────────────────────────────────────────────
// SPARKLINE
// ─────────────────────────────────────────────────────────────

function Spark({ data, color = '#22c55e', width = 60, height = 28 }: {
  data: number[]; color?: string; width?: number; height?: number;
}) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - 4 - ((v - min) / range) * (height - 8)}`
  ).join(' ');
  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// INDICATOR CARD
// ─────────────────────────────────────────────────────────────

function IndicatorCard({
  title, value, unit = '', history, inverted = false, compact = false,
  description, source, sourceUrl,
}: {
  title: string; value: string; unit?: string;
  history?: number[]; inverted?: boolean; compact?: boolean;
  description?: string; source?: string; sourceUrl?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const delta = history ? calcDelta(history) : null;
  const isUp = delta !== null && delta > 0;
  const isFlat = delta === null || delta === 0;

  let deltaColor = 'text-white/30';
  let Arrow = Minus;
  if (!isFlat) {
    if (inverted) {
      deltaColor = isUp ? 'text-red-400' : 'text-green-400';
      Arrow = isUp ? TrendingUp : TrendingDown;
    } else {
      deltaColor = isUp ? 'text-green-400' : 'text-red-400';
      Arrow = isUp ? TrendingUp : TrendingDown;
    }
  }

  const sparkColor = isFlat ? '#64748b' : isUp
    ? (inverted ? '#f87171' : '#34d399')
    : (inverted ? '#34d399' : '#f87171');

  return (
    <div
      className={`rounded-md border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] cursor-pointer select-none transition-all hover:border-white/[0.1] ${compact ? 'p-3' : 'p-4'}`}
      onClick={() => { if (description || source) setExpanded(!expanded); }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1 truncate">{title}</div>
          <div className="flex items-baseline gap-1.5">
            <span className={`${compact ? 'text-lg' : 'text-xl'} font-semibold tracking-tight text-white/90`}>{value}</span>
            {unit && <span className="text-[10px] text-white/40">{unit}</span>}
          </div>
          {delta !== null && (
            <div className={`flex items-center gap-1 mt-1 text-[10px] ${deltaColor}`}>
              <Arrow size={10} />
              <span>{delta >= 0 ? '+' : ''}{delta.toFixed(2)} 5d</span>
            </div>
          )}
        </div>
        {history && history.length > 2 && (
          <Spark data={history} color={sparkColor} />
        )}
      </div>

      {(description || source) && (
        <div className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-40 mt-3 pt-3 border-t border-white/[0.06]' : 'max-h-0'}`}>
          {description && <p className="text-[10px] text-white/40 leading-relaxed mb-2">{description}</p>}
          {source && (
            sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={10} />
                <span>{source}</span>
              </a>
            ) : (
              <div className="flex items-center gap-1 text-[10px] text-cyan-400">
                <ExternalLink size={10} />
                <span>{source}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHART COMPONENT (SVG area chart)
// ─────────────────────────────────────────────────────────────

function AreaChart({ data, color = '#22c55e', height = 180 }: {
  data: number[]; color?: string; height?: number;
}) {
  if (!data || data.length < 2) return <div className="h-[180px] rounded-md bg-white/[0.02] animate-pulse" />;
  const w = 600, h = 160;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 8;
  const pts = data.map((v, i) =>
    `${pad + (i / (data.length - 1)) * (w - pad * 2)},${pad + h - pad - ((v - min) / range) * (h - pad * 2)}`
  );
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ');
  const areaPath = `${linePath} L${w - pad},${h} L${pad},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded-md" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace('#', '')})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// SKELETON LOADER
// ─────────────────────────────────────────────────────────────

function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-24 rounded-md bg-white/[0.03] animate-pulse border border-white/[0.04]" />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB COMPONENTS
// ─────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: MacroSeries[] }) {
  const regime = getRegime(data);
  const g = (id: string) => data.find(d => d.id === id);
  const fred = (id: string) => `https://fred.stlouisfed.org/series/${id}`;

  return (
    <div className="space-y-4">
      {/* Regime Banner */}
      <div className="rounded-md border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
        <div className="flex items-start gap-3">
          <Activity size={18} className={`mt-0.5 flex-shrink-0 ${regime.color}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold tracking-wider ${regime.color}`}>{regime.label}</span>
              <span className="text-[10px] text-white/30 uppercase">Macro Regime</span>
            </div>
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed max-w-2xl">{regime.description}</p>
          </div>
        </div>
      </div>

      {/* Indicator Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <IndicatorCard title="S&P 500" value={formatValue(g('SP500')?.value, 0)} history={g('SP500')?.history} compact description="Broad equity benchmark. Tracks 500 large-cap US stocks." source="FRED" sourceUrl={fred('SP500')} />
        <IndicatorCard title="Fed Funds" value={`${formatValue(g('FEDFUNDS')?.value, 2)}%`} history={g('FEDFUNDS')?.history} compact description="Federal Funds effective rate — the Fed's primary policy lever." source="FRED" sourceUrl={fred('FEDFUNDS')} />
        <IndicatorCard title="10Y Treasury" value={`${formatValue(g('DGS10')?.value, 2)}%`} history={g('DGS10')?.history} compact description="10-Year Treasury constant maturity rate. Benchmark for mortgage rates." source="FRED" sourceUrl={fred('DGS10')} />
        <IndicatorCard title="CPI (YoY)" value={`${formatValue(g('CPIAUCSL')?.value, 2)}%`} history={g('CPIAUCSL')?.history} compact description="Consumer Price Index — headline inflation measure." source="BLS" />
        <IndicatorCard title="Core PCE" value={`${formatValue(g('PCEPILFE')?.value, 2)}%`} history={g('PCEPILFE')?.history} compact description="Fed's preferred inflation gauge. Excludes food and energy." source="BEA" />
        <IndicatorCard title="Unemployment" value={`${formatValue(g('UNRATE')?.value, 1)}%`} history={g('UNRATE')?.history} compact inverted description="U-3 unemployment rate. Above 4.5% signals labor market weakness." source="BLS" />
        <IndicatorCard title="Real GDP" value={`${formatValue(g('A191RL1Q225SBEA')?.value, 1)}%`} unit="QoQ" history={g('A191RL1Q225SBEA')?.history} compact description="Real GDP quarterly growth, seasonally adjusted annual rate." source="BEA" />
        <IndicatorCard title="VIX" value={formatValue(g('VIXCLS')?.value, 1)} history={g('VIXCLS')?.history} compact inverted description="CBOE Volatility Index — 'fear gauge'. Above 20 signals elevated stress." source="FRED" sourceUrl={fred('VIXCLS')} />
        <IndicatorCard title="DXY" value={formatValue(g('DTWEXBGS')?.value, 2)} history={g('DTWEXBGS')?.history} compact description="US Dollar Index. Rising DXY tightens global financial conditions." source="FRED" sourceUrl={fred('DTWEXBGS')} />
      </div>
    </div>
  );
}

function RatesTab({ data }: { data: MacroSeries[] }) {
  const g = (id: string) => data.find(d => d.id === id);
  const fred = (id: string) => `https://fred.stlouisfed.org/series/${id}`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <IndicatorCard title="Fed Funds Rate" value={`${formatValue(g('FEDFUNDS')?.value, 2)}%`} history={g('FEDFUNDS')?.history} compact description="Federal Funds effective rate — the Fed's primary policy lever." source="FRED" sourceUrl={fred('FEDFUNDS')} />
        <IndicatorCard title="10Y Treasury" value={`${formatValue(g('DGS10')?.value, 2)}%`} history={g('DGS10')?.history} compact description="10-Year Treasury constant maturity rate. Benchmark for mortgages." source="FRED" sourceUrl={fred('DGS10')} />
        <IndicatorCard title="2Y Treasury" value={`${formatValue(g('DGS2')?.value, 2)}%`} history={g('DGS2')?.history} compact description="2-Year Treasury yield. Most sensitive to Fed policy expectations." source="FRED" sourceUrl={fred('DGS2')} />
        <IndicatorCard title="30Y Treasury" value={`${formatValue(g('DGS30')?.value, 2)}%`} history={g('DGS30')?.history} compact description="30-Year Treasury 'long bond'. Reflects long-term growth expectations." source="FRED" sourceUrl={fred('DGS30')} />
        <IndicatorCard title="5Y Treasury" value={`${formatValue(g('DGS5')?.value, 2)}%`} history={g('DGS5')?.history} compact description="5-Year Treasury yield. Key reference for corporate borrowing." source="FRED" sourceUrl={fred('DGS5')} />
        <IndicatorCard title="10Y-2Y Spread" value={`${formatValue(g('T10Y2Y')?.value, 2)}%`} history={g('T10Y2Y')?.history} compact description="Yield curve spread. Negative = inversion (recession signal)." source="FRED" sourceUrl={fred('T10Y2Y')} />
        <IndicatorCard title="10Y-3M Spread" value={`${formatValue(g('T10Y3M')?.value, 2)}%`} history={g('T10Y3M')?.history} compact description="Fed's preferred yield curve metric for recession prediction." source="FRED" sourceUrl={fred('T10Y3M')} />
        <IndicatorCard title="30Y Mortgage" value={`${formatValue(g('MORTGAGE30US')?.value, 2)}%`} history={g('MORTGAGE30US')?.history} compact description="30-year fixed mortgage rate. Key for housing market health." source="FRED" sourceUrl={fred('MORTGAGE30US')} />
      </div>
      {/* Yield Curve Chart */}
      <div className="rounded-md border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
        <div className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Yield Curve (Current)</div>
        <AreaChart
          data={[g('DGS2')?.value || 0, g('DGS5')?.value || 0, g('DGS10')?.value || 0, g('DGS30')?.value || 0]}
          color="#22c55e" height={120}
        />
      </div>
    </div>
  );
}

function InflationTab({ data }: { data: MacroSeries[] }) {
  const g = (id: string) => data.find(d => d.id === id);
  const fred = (id: string) => `https://fred.stlouisfed.org/series/${id}`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <IndicatorCard title="CPI (YoY)" value={`${formatValue(g('CPIAUCSL')?.value, 2)}%`} history={g('CPIAUCSL')?.history} compact description="Consumer Price Index — headline inflation. Target: 2%." source="FRED" sourceUrl={fred('CPIAUCSL')} />
        <IndicatorCard title="Core CPI (YoY)" value={`${formatValue(g('CPILFESL')?.value, 2)}%`} history={g('CPILFESL')?.history} compact description="Core CPI excludes food and energy. Better signal of underlying trend." source="BLS" />
        <IndicatorCard title="PCE (YoY)" value={`${formatValue(g('PCEPI')?.value, 2)}%`} history={g('PCEPI')?.history} compact description="Personal Consumption Expenditures price index." source="BEA" />
        <IndicatorCard title="Core PCE (YoY)" value={`${formatValue(g('PCEPILFE')?.value, 2)}%`} history={g('PCEPILFE')?.history} compact description="Fed's preferred inflation gauge. Target: 2%." source="BEA" />
        <IndicatorCard title="PPI (YoY)" value={`${formatValue(g('PPIFIS')?.value, 2)}%`} history={g('PPIFIS')?.history} compact description="Producer Price Index — pipeline inflation pressure." source="FRED" sourceUrl={fred('PPIFIS')} />
        <IndicatorCard title="WTI Crude" value={`$${formatValue(g('DCOILWTICO')?.value, 1)}`} history={g('DCOILWTICO')?.history} compact description="West Texas Intermediate crude. Key input for inflation expectations." source="EIA" />
        <IndicatorCard title="Shelter CPI" value={`${formatValue(g('CUSR0000SAH1')?.value, 2)}%`} unit="YoY" history={g('CUSR0000SAH1')?.history} compact description="Housing/shelter component of CPI. Largest CPI category (~34%)." source="BLS" />
        <IndicatorCard title="Breakeven 10Y" value={`${formatValue(g('T10YIE')?.value, 2)}%`} history={g('T10YIE')?.history} compact description="Market-implied inflation expectation over next 10 years." source="FRED" sourceUrl={fred('T10YIE')} />
      </div>
    </div>
  );
}

function GrowthTab({ data }: { data: MacroSeries[] }) {
  const g = (id: string) => data.find(d => d.id === id);
  const m2History = g('M2SL')?.history || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <IndicatorCard title="Real GDP Growth" value={`${formatValue(g('A191RL1Q225SBEA')?.value, 1)}%`} unit="QoQ SAAR" history={g('A191RL1Q225SBEA')?.history} description="Real GDP quarterly growth rate, seasonally adjusted annual rate." source="BEA" />
        <IndicatorCard title="Nominal GDP" value={`${formatValue(g('GDP')?.value, 1)}T`} history={g('GDP')?.history} description="Nominal GDP in trillions. Not adjusted for inflation." source="BEA" />
        <IndicatorCard title="Industrial Production" value={`${formatValue(g('IPMAN')?.value, 2)}%`} unit="MoM" history={g('IPMAN')?.history} description="Manufacturing output. Negative readings signal contraction." source="Fed" />
        <IndicatorCard title="M2 Money Supply" value={`${formatValue(g('M2SL')?.value, 1)}T`} history={g('M2SL')?.history} description="Broad money supply. Growth above nominal GDP can be inflationary." source="FRED" />
        <IndicatorCard title="Housing Starts" value={`${formatValue(g('HOUST')?.value, 2)}M`} history={g('HOUST')?.history} description="New residential construction. Leading indicator for the economy." source="Census" />
        <IndicatorCard title="Retail Sales" value={`${formatValue(g('RSAFS')?.value, 2)}%`} unit="MoM" history={g('RSAFS')?.history} description="Consumer spending on goods. Key driver of GDP (~70% of economy)." source="Census" />
      </div>
      {/* M2 Velocity Chart */}
      {m2History.length > 0 && (
        <div className="rounded-md border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">M2 Money Supply Trend</span>
            <span className="text-[10px] text-white/30">Trailing 24 months</span>
          </div>
          <AreaChart data={m2History} color="#f97316" height={160} />
        </div>
      )}
    </div>
  );
}

function LaborTab({ data }: { data: MacroSeries[] }) {
  const g = (id: string) => data.find(d => d.id === id);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <IndicatorCard title="Unemployment Rate" value={`${formatValue(g('UNRATE')?.value, 1)}%`} history={g('UNRATE')?.history} compact inverted description="U-3 unemployment rate. Sahm rule: 3-mo avg rises 0.5pp above 12-mo low = recession." source="BLS" />
        <IndicatorCard title="Nonfarm Payrolls" value={`${formatValue(g('PAYEMS')?.value, 0)}K`} history={g('PAYEMS')?.history} compact description="Monthly change in nonfarm payroll employment. ~200K = healthy growth." source="BLS" />
        <IndicatorCard title="Avg Hourly Earnings" value={`${formatValue(g('CES0500000003')?.value, 1)}%`} unit="YoY" history={g('CES0500000003')?.history} compact description="Wage growth. Above 4% risks wage-price spiral." source="BLS" />
        <IndicatorCard title="Initial Claims" value={`${formatValue(g('ICSA')?.value, 0)}K`} history={g('ICSA')?.history} compact inverted description="Weekly initial unemployment claims. Sustained &gt;250K signals weakening." source="DOL" />
        <IndicatorCard title="U6 Underemployment" value={`${formatValue(g('U6RATE')?.value, 1)}%`} history={g('U6RATE')?.history} compact inverted description="Broad underemployment incl. part-time wanting full-time work." source="BLS" />
        <IndicatorCard title="Labor Participation" value={`${formatValue(g('CIVPART')?.value, 1)}%`} history={g('CIVPART')?.history} compact description="Share of working-age population in labor force." source="BLS" />
        <IndicatorCard title="Breakeven Inflation" value={`${formatValue(g('T10YIE')?.value, 2)}%`} history={g('T10YIE')?.history} compact description="Market-implied inflation from TIPS spread." source="FRED" />
      </div>
    </div>
  );
}

function RiskTab({ data }: { data: MacroSeries[] }) {
  const g = (id: string) => data.find(d => d.id === id);

  const geoRisks = [
    { region: 'Middle East / Iran', level: 'HIGH', color: 'text-red-400 bg-red-500/10 border-red-500/20', description: 'Iran conflict pushing oil prices higher, disrupting global energy supply. Strait of Hormuz risk.' },
    { region: 'US-China Trade', level: 'MEDIUM', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', description: 'Tariff escalation risk. Tech decoupling intensifying. Taiwan contingency planning.' },
    { region: 'Russia-Ukraine', level: 'MEDIUM', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', description: 'Energy supply disruption to Europe. Food security risks for emerging markets.' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <IndicatorCard title="VIX Index" value={formatValue(g('VIXCLS')?.value, 1)} history={g('VIXCLS')?.history} compact inverted description="CBOE Volatility Index. &lt;15 = complacent, 15-25 = normal, &gt;30 = elevated stress." source="CBOE" />
        <IndicatorCard title="HY Credit Spread" value={`${formatValue(g('BAMLH0A0HYM2')?.value, 0)} bps`} history={g('BAMLH0A0HYM2')?.history} compact inverted description="High yield bond spread over Treasuries. &gt;500 bps signals credit stress." source="FRED" />
        <IndicatorCard title="TED Spread" value={`${formatValue(g('TEDRATE')?.value, 2)}%`} history={g('TEDRATE')?.history} compact inverted description="Interbank lending stress indicator. &gt;0.5% signals funding stress." source="FRED" />
        <IndicatorCard title="Consumer Sentiment" value={formatValue(g('UMCSENT')?.value, 1)} history={g('UMCSENT')?.history} compact inverted description="University of Michigan consumer sentiment. Leading indicator for spending." source="Michigan" />
        <IndicatorCard title="Consumer Confidence" value={formatValue(g('CSCICP03USM665S')?.value, 1)} history={g('CSCICP03USM665S')?.history} compact inverted description="Conference Board consumer confidence. Reflects labor market outlook." source="Conf. Board" />
        <IndicatorCard title="Recession Prob (6M)" value={`${formatValue(g('RECPROUSM156N')?.value, 0)}%`} history={g('RECPROUSM156N')?.history} compact inverted description="NY Fed yield curve-based recession probability. &gt;25% = elevated risk." source="NY Fed" />
        <IndicatorCard title="Breakeven 10Y" value={`${formatValue(g('T10YIE')?.value, 2)}%`} history={g('T10YIE')?.history} compact description="10-year TIPS breakeven inflation rate. Market inflation expectation." source="FRED" />
        <IndicatorCard title="Gold (XAUUSD proxy)" value={`$${formatValue(g('GOLDPMGBD228NLBM')?.value, 0)}`} history={g('GOLDPMGBD228NLBM')?.history} compact description="London PM gold (FRED). Watchlist / chart use XAUUSD." source="FRED" />
      </div>

      {/* Geopolitical Risk Cards */}
      <div className="rounded-md border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
        <div className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Geopolitical Risk Monitor</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {geoRisks.map((r, i) => (
            <div key={i} className={`rounded-md border p-3 ${r.color}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-medium text-white/70">{r.region}</span>
                <span className="text-[9px] font-bold uppercase">{r.level}</span>
              </div>
              <p className="text-[10px] text-white/40 leading-relaxed">{r.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function MacroTerminal() {
  const [data, setData] = useState<MacroSeries[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [, setRerender] = useState(0);

  const load = useCallback(async () => {
    const series = await macroSeries();
    setData(series);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keyboard shortcuts 1-6
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const tab = TABS.find(t => t.key === e.key);
      if (tab) { e.preventDefault(); setActiveTab(tab.id); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Re-render “Xs ago” for engine-backed macro without lying as “LIVE” when on mock fallback.
  useEffect(() => {
    const t = setInterval(() => setRerender((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setTimeout(() => setRefreshing(false), 1000);
  };

  const macroLive = isMacroFeedLive();
  const engineSec = getMacroFeedRefreshedSecondsAgo();
  const macroErr = getMacroFeedLastError();

  const timeAgo = () => {
    if (macroLive && engineSec != null) {
      if (engineSec < 60) return `${engineSec}s ago`;
      return `${Math.floor(engineSec / 60)}m ago`;
    }
    const now = Date.now();
    const diff = Math.floor((now - lastUpdated.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'overview': return <OverviewTab data={data} />;
      case 'rates': return <RatesTab data={data} />;
      case 'inflation': return <InflationTab data={data} />;
      case 'growth': return <GrowthTab data={data} />;
      case 'labor': return <LaborTab data={data} />;
      case 'risk': return <RiskTab data={data} />;
      default: return <OverviewTab data={data} />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
      {/* ═══════ HEADER ═══════ */}
      <div className="flex-shrink-0 border-b border-white/5 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe size={14} className="text-cyan-400" aria-hidden />
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">MACRO TERMINAL</span>
          </div>

          {/* Right: LIVE + Refresh */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] text-white/40" title={macroErr && !macroLive ? macroErr : undefined}>
              {macroLive ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span className="text-emerald-400 font-medium">LIVE</span>
                </>
              ) : null}
              <span className="font-mono text-white/30">{timeAgo()}</span>
            </div>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 transition-colors"
              title="Refresh data"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ═══════ TAB NAVIGATION ═══════ */}
        <nav className="flex items-center gap-1 mt-2">
          {TABS.map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-t-md transition-all border-b-2 ${
                  isActive
                    ? 'text-white/80 border-cyan-500 bg-white/[0.03]'
                    : 'text-white/40 border-transparent hover:text-white/60 hover:bg-white/[0.02]'
                }`}
              >
                <Icon size={14} />
                <span>{t.label}</span>
                <span className="hidden md:inline text-[9px] text-white/20 ml-0.5 font-mono">{t.key}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ═══════ CONTENT ═══════ */}
      <div className="p-4 space-y-4">
        {data.length === 0 ? <SkeletonGrid count={8} /> : renderTab()}
      </div>

      {/* ═══════ FOOTER ═══════ */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-between text-[10px] text-white/25">
          <div>
            Data: FRED (St. Louis Fed) &middot; US Treasury &middot; BLS &middot; BEA &middot; CBOE
            <span className="mx-2">&middot;</span>
            Auto-refreshes every 5 minutes
          </div>
          <span>Built with Trading OS</span>
        </div>
      </div>
    </div>
  );
}
