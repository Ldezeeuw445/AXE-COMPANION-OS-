/**
 * ENGINE ADAPTER — public barrel for pages (`@/lib/engineAdapter`).
 *
 * Market data paths call `getTradingAdapter()` (Supabase `engine-proxy` when `VITE_USE_ENGINE_EDGE=true`).
 * Intel snapshots call Supabase `intel-proxy` when Edge mode is on (see `callIntelProxy`).
 * Functions marked PLACEHOLDER in JSDoc have no engine implementation yet — they return deterministic demo data.
 */

import { supabase } from '@/lib/supabase';
import { getTradingAdapter } from './tradingAdapterSingleton';
import type { ChartFetchDebugMeta } from '@/engine/types/chart';
import { ChartFetchError } from '@/engine/types/chart';
import type { CorporateJet, CorporateJetsMetrics } from '@/engine/types/intel';

type IntelFeedKey = 'corporateJets' | 'vesselStream' | 'insiderTrades' | 'whaleTransactions';
const intelFeedLive: Record<IntelFeedKey, boolean> = {
  corporateJets: false,
  vesselStream: false,
  insiderTrades: false,
  whaleTransactions: false,
};

export function isIntelFeedLive(feed: IntelFeedKey): boolean {
  return intelFeedLive[feed] === true;
}

const intelFeedLastOkMs: Record<IntelFeedKey, number> = {
  corporateJets: 0,
  vesselStream: 0,
  insiderTrades: 0,
  whaleTransactions: 0,
};

const intelFeedLastError: Record<IntelFeedKey, string | null> = {
  corporateJets: null,
  vesselStream: null,
  insiderTrades: null,
  whaleTransactions: null,
};

export function getIntelFeedRefreshedSecondsAgo(feed: IntelFeedKey): number | null {
  const ms = intelFeedLastOkMs[feed] || 0;
  if (!ms) return null;
  return Math.max(0, Math.round((Date.now() - ms) / 1000));
}

export function getIntelFeedLastError(feed: IntelFeedKey): string | null {
  return intelFeedLastError[feed] ?? null;
}

/** True when at least one macro series was loaded from the engine (FRED via engine-proxy), not full mock fallback. */
let macroFeedLive = false;
let macroFeedLastOkMs = 0;
let macroFeedLastError: string | null = null;

export function isMacroFeedLive(): boolean {
  return macroFeedLive;
}

export function getMacroFeedRefreshedSecondsAgo(): number | null {
  if (!macroFeedLastOkMs) return null;
  return Math.max(0, Math.round((Date.now() - macroFeedLastOkMs) / 1000));
}

export function getMacroFeedLastError(): string | null {
  return macroFeedLastError;
}

let newsFeedLive = false;
let newsFeedLastOkMs = 0;
let newsFeedLastError: string | null = null;

export function isNewsFeedLive(): boolean {
  return newsFeedLive;
}

export function getNewsFeedRefreshedSecondsAgo(): number | null {
  if (!newsFeedLastOkMs) return null;
  return Math.max(0, Math.round((Date.now() - newsFeedLastOkMs) / 1000));
}

export function getNewsFeedLastError(): string | null {
  return newsFeedLastError;
}

/** Monthly index series → YoY % for UI cards that show “% YoY”. */
const MACRO_YOY_12M = new Set([
  'CPIAUCSL',
  'CPILFESL',
  'PCEPI',
  'PCEPILFE',
  'PPIFIS',
  'CUSR0000SAH1',
  'CES0500000003',
]);

function transformMacroPointsForUi(
  key: string,
  points: Array<{ date: string; value: number }>,
): Array<{ date: string; value: number }> {
  if (!points.length) return points;
  const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (MACRO_YOY_12M.has(key)) {
    const out: Array<{ date: string; value: number }> = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i < 12) continue;
      const prev = sorted[i - 12]?.value;
      const cur = sorted[i]?.value;
      if (prev == null || cur == null || !Number.isFinite(prev) || !Number.isFinite(cur) || prev === 0) continue;
      out.push({ date: sorted[i].date, value: ((cur / prev) - 1) * 100 });
    }
    return out.length ? out : sorted;
  }
  if (key === 'PAYEMS' || key === 'ICSA') {
    return sorted.map((p) => ({ date: p.date, value: p.value / 1000 }));
  }
  if (key === 'GDP') {
    return sorted.map((p) => ({ date: p.date, value: p.value / 1000 }));
  }
  return sorted;
}

async function tryEngine<T>(fn: (adapter: ReturnType<typeof getTradingAdapter>) => Promise<T>): Promise<T | null> {
  try {
    const adapter = getTradingAdapter();
    return await fn(adapter);
  } catch {
    return null;
  }
}

async function tryEngineDetailed<T>(fn: (adapter: ReturnType<typeof getTradingAdapter>) => Promise<T>): Promise<{ value: T | null; error: string | null }> {
  try {
    const adapter = getTradingAdapter();
    const value = await fn(adapter);
    return { value, error: null };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { value: null, error: error || 'engine_unavailable' };
  }
}

async function callIntelProxy<T>(action: string, args: Record<string, unknown>): Promise<T> {
  try {
    await supabase.auth.refreshSession();
  } catch {
    /* ignore */
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? null;

  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  const base = import.meta.env.VITE_SUPABASE_URL ?? '';
  if (!anon || !base) throw new Error('missing_supabase_client_env');

  const url = `${base.replace(/\/$/, '')}/functions/v1/intel-proxy`;
  const authHeader = token ? `Bearer ${token}` : `Bearer ${anon}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, args }),
  });
  const json = (await res.json()) as { ok: boolean; data?: T; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error || `intel_proxy_${res.status}`);
  return json.data as T;
}

let lastCorporateJetsTop50: CorporateJet[] = [];
let lastCorporateJetsMetrics: CorporateJetsMetrics | null = null;

export function getCorporateJetsTop50(): CorporateJet[] {
  return lastCorporateJetsTop50;
}

export function getCorporateJetsMetrics(): CorporateJetsMetrics | null {
  return lastCorporateJetsMetrics;
}

async function fetchIntelCorporateJetsBundle(): Promise<{
  positions: JetPosition[];
  top50: CorporateJet[];
  metrics: CorporateJetsMetrics;
}> {
  try {
    await supabase.auth.refreshSession();
  } catch {
    /* ignore */
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? null;

  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  const base = import.meta.env.VITE_SUPABASE_URL ?? '';
  if (!anon || !base) throw new Error('missing_supabase_client_env');

  const url = `${base.replace(/\/$/, '')}/functions/v1/intel-proxy`;
  const authHeader = token ? `Bearer ${token}` : `Bearer ${anon}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'corporateJets', args: {} }),
  });
  const json = (await res.json()) as {
    ok: boolean;
    data?: JetPosition[];
    top50?: CorporateJet[];
    metrics?: CorporateJetsMetrics;
    error?: string;
    source?: string;
  };
  if (!res.ok || !json.ok) throw new Error(json.error || `intel_proxy_${res.status}`);
  const positions = Array.isArray(json.data) ? json.data : [];
  const top50Raw = Array.isArray(json.top50) ? json.top50 : [];
  let top50: CorporateJet[] = top50Raw.map((row) => {
    const s = (row as CorporateJet).signal;
    const signal: CorporateJet['signal'] =
      s === 'anomaly' || s === 'meeting' || s === 'regulatory' || s === 'normal' ? s : 'normal';
    return { ...(row as CorporateJet), signal };
  });
  const positionSource = String(json.source ?? 'intel-proxy');
  if (positions.length > 0 && top50.length === 0) {
    top50 = jetPositionsToCorporateTop50(positions, positionSource);
  }
  const sm = json.metrics;
  const metrics = computeCorporateJetsMetrics(
    Math.max(positions.length, typeof sm?.liveAircraftCount === 'number' ? sm.liveAircraftCount : 0),
    top50,
    sm?.enrichmentProvider ?? null,
    sm?.lastEnrichmentError ?? null,
    sm?.positionSource ?? positionSource,
  );
  return { positions, top50, metrics };
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  timestamp: string;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MacroSeries {
  id: string;
  name: string;
  value: number;
  unit: string;
  change: number;
  direction: 'up' | 'down' | 'neutral';
  source: string;
  updated: string;
  history: number[];
  historyLabels: string[];
}

export interface JetPosition {
  icao24: string;
  company: string;
  ticker: string;
  aircraft: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  origin: string;
  destination: string;
  departureTime: string;
  eta: string;
  signal: 'normal' | 'anomaly' | 'meeting' | 'regulatory';
  route: string;
}

function normalizeJetSignal(s: unknown): JetPosition['signal'] {
  return s === 'anomaly' || s === 'meeting' || s === 'regulatory' || s === 'normal' ? s : 'normal';
}

/** Top 50 table rows from live map positions when bundle omits corporate rows (intel-proxy / engine path). */
function jetPositionsToCorporateTop50(jets: JetPosition[], positionSource: string): CorporateJet[] {
  return jets.slice(0, 50).map((j, idx) => {
    const icao24 = String(j.icao24 ?? '')
      .trim()
      .toLowerCase() || `unk_${idx}`;
    const op = String(j.company ?? '').trim();
    const hasOp = op.length > 1 && !/^unknown/i.test(op) && !/^ads-?b$/i.test(op);
    const lastSeen =
      typeof j.departureTime === 'string' && j.departureTime ? String(j.departureTime) : new Date().toISOString();
    return {
      id: `${icao24}-${idx}`,
      icao24,
      callsign: String(j.aircraft ?? '').trim() || 'UNKNOWN',
      tailNumber: j.origin && j.origin !== '—' ? String(j.origin) : undefined,
      operator: hasOp ? op : undefined,
      aircraftType: undefined,
      latitude: Number(j.lat),
      longitude: Number(j.lon),
      altitude: Number(j.altitude) || 0,
      speed: Number(j.speed) || 0,
      heading: 0,
      lastSeen,
      source: positionSource,
      enrichmentSource: null,
      category: hasOp ? 'corporate' : 'unknown',
      signal: normalizeJetSignal(j.signal),
    };
  });
}

function computeCorporateJetsMetrics(
  liveAircraftCount: number,
  top50: CorporateJet[],
  enrichmentProvider: string | null,
  lastEnrichmentError: string | null,
  positionSource: string,
): CorporateJetsMetrics {
  let enrichedOperatorCount = 0;
  let unknownOperatorCount = 0;
  for (const row of top50) {
    if (row.operator?.trim()) enrichedOperatorCount++;
    else unknownOperatorCount++;
  }
  return {
    liveAircraftCount,
    top50Count: top50.length,
    enrichedOperatorCount,
    unknownOperatorCount,
    enrichmentProvider,
    lastEnrichmentError,
    positionSource,
  };
}

export interface Vessel {
  mmsi: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  speed: number;
  destination: string;
  status: 'in_transit' | 'anchored' | 'loitering' | 'ais_gap';
  eta: string;
  /** Optional listed operator — map marker color on Intel vessel card */
  operatorTicker?: string;
}

export interface VesselAlert {
  id: string;
  message: string;
  category: string;
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
}

export interface DarkPoolPrint {
  symbol: string;
  price: number;
  size: number;
  notional: number;
  time: string;
  side: 'buy' | 'sell' | 'neutral';
}

export interface InsiderTrade {
  ticker: string;
  insider: string;
  role: string;
  type: 'BUY' | 'SELL';
  shares: number;
  value: number;
  date: string;
}

export interface SenateTrade {
  politician: string;
  chamber: 'Senate' | 'House';
  ticker: string;
  direction: 'BUY' | 'SELL';
  size: string;
  date: string;
}

export interface PolymarketMarket {
  id: string;
  question: string;
  category: string;
  asset: string;
  volume24h: number;
  yesPrice: number;
  noPrice: number;
  endDate: string;
  liquidity: number;
}

export interface PolymarketNewsItem {
  title: string;
  source: string;
  timestamp: string;
  relatedMarket: string;
}

export interface WhaleTx {
  chain: string;
  from: string;
  to: string;
  amount: number;
  amountUsd: number;
  type: string;
  timestamp: string;
  txHash: string;
}

export interface DataCenter {
  id: string;
  name: string;
  operator: string;
  operatorColor: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  capacityMW: number;
  gpuCount: number;
  status: 'operational' | 'under_construction' | 'announced';
  linkedTickers: string[];
  yearOnline: string;
}

export interface EarningsEvent {
  ticker: string;
  company: string;
  date: string;
  time: 'BMO' | 'AMC';
  epsEstimate: number | null;
  revenueEstimate: number | null;
  epsSurprise: number | null;
  impact: 'high' | 'medium' | 'low';
  sector: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  timestamp: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  tickers: string[];
  category: string;
  /** Original article URL when provided by the engine. */
  url?: string;
}

export interface ScannerResult {
  symbol: string;
  price: number;
  change24h: number;
  rsi: number;
  volumeX: number;
  klv: string;
  sparkline: number[];
  matchedFilters: string[];
  category: string;
}

export interface BacktestResult {
  netProfit: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  expectancy: number;
  calmarRatio: number;
  rMultiple: number;
  trades: BacktestTrade[];
  equityCurve: number[];
}

export interface BacktestTrade {
  id: number;
  direction: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  pnl: number;
  rMultiple: number;
  exitReason: string;
  holdingPeriod: string;
}

// ═══════════════════════════════════════════════════════════
// MOCK DATA HELPERS
// ═══════════════════════════════════════════════════════════

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max));
}

function spark(n: number, start: number, volatility: number): number[] {
  const out: number[] = [start];
  for (let i = 1; i < n; i++) {
    out.push(out[i - 1] + rand(-volatility, volatility));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════
// QUOTES
// ═══════════════════════════════════════════════════════════

export async function quote(symbol: string): Promise<Quote> {
  const chart = await tryEngine((a) => a.getChart(symbol, '1D', 120));
  const candles = chart?.candles;
  if (Array.isArray(candles) && candles.length > 0) {
    const last = candles[candles.length - 1]!;
    const prev = candles.length > 1 ? candles[candles.length - 2]! : last;
    const price = Number(last.close);
    const prevClose = Number(prev.close ?? last.close);
    const change = Number.isFinite(price) && Number.isFinite(prevClose) ? price - prevClose : 0;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;
    return {
      symbol,
      price,
      change,
      changePercent,
      open: Number(last.open),
      high: Number(last.high),
      low: Number(last.low),
      volume: Number(last.volume) || 0,
      timestamp: String(last.time ?? new Date().toISOString()),
    };
  }
  const base = symbol === 'EUR/USD' ? 1.0842 : symbol === 'GBP/USD' ? 1.2645 : symbol === 'BTC/USD' ? 87400 : symbol === 'XAU/USD' ? 2342 : 100;
  return {
    symbol,
    price: base + rand(-0.5, 0.5),
    change: rand(-2, 2),
    changePercent: rand(-0.5, 0.5),
    open: base - 0.1,
    high: base + 0.5,
    low: base - 0.5,
    volume: randInt(1000000, 50000000),
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════
// HISTORICAL CANDLES
// ═══════════════════════════════════════════════════════════

export async function historical(symbol: string, _tf = '1D'): Promise<Candle[]> {
  const raw = String(_tf || '1D').toUpperCase();
  const engineTf =
    raw === '1W' || raw === 'W' || raw === 'WEEK'
      ? '1W'
      : raw === '1H' || raw === 'H'
        ? '1H'
        : raw === '4H'
          ? '4H'
          : raw === '1MO'
            ? '1MO'
            : '1D';
  const chart = await tryEngine((a) => a.getChart(symbol, engineTf, 180));
  const rows = chart?.candles;
  if (Array.isArray(rows) && rows.length > 0) {
    return rows.map((c) => ({
      time: String(c.time),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume) || 0,
    }));
  }
  const base = symbol === 'EUR/USD' ? 1.08 : symbol === 'BTC/USD' ? 87000 : 100;
  const candles: Candle[] = [];
  let price = base;
  for (let i = 30; i >= 0; i--) {
    const o = price;
    const c = o + rand(-0.02, 0.02);
    const h = Math.max(o, c) + rand(0, 0.01);
    const l = Math.min(o, c) - rand(0, 0.01);
    candles.push({
      time: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
      open: o, high: h, low: l, close: c,
      volume: randInt(1000000, 10000000),
    });
    price = c;
  }
  return candles;
}

// ═══════════════════════════════════════════════════════════
// MACRO SERIES
// ═══════════════════════════════════════════════════════════

const MACRO_DEFS: MacroSeries[] = [
  // ═══ RATES ═══
  { id: 'FEDFUNDS', name: 'Fed Funds Rate', value: 4.33, unit: '%', change: -0.25, direction: 'down', source: 'FRED', updated: 'Apr 2026', history: spark(24, 5.5, 0.15), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'DGS10', name: '10Y Treasury', value: 4.39, unit: '%', change: 0.08, direction: 'up', source: 'FRED', updated: 'Apr 2026', history: spark(24, 4.0, 0.1), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'DGS2', name: '2Y Treasury', value: 3.92, unit: '%', change: 0.12, direction: 'up', source: 'FRED', updated: 'Apr 2026', history: spark(24, 4.5, 0.12), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'DGS30', name: '30Y Treasury', value: 4.52, unit: '%', change: 0.05, direction: 'up', source: 'FRED', updated: 'Apr 2026', history: spark(24, 4.2, 0.1), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'DGS5', name: '5Y Treasury', value: 4.08, unit: '%', change: 0.09, direction: 'up', source: 'FRED', updated: 'Apr 2026', history: spark(24, 3.8, 0.1), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'T10Y2Y', name: '10Y-2Y Spread', value: 0.47, unit: '%', change: -0.04, direction: 'down', source: 'FRED', updated: 'Apr 2026', history: spark(24, -0.2, 0.08), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'T10Y3M', name: '10Y-3M Spread', value: 0.38, unit: '%', change: -0.02, direction: 'down', source: 'FRED', updated: 'Apr 2026', history: spark(24, -0.5, 0.1), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'MORTGAGE30US', name: '30Y Mortgage', value: 6.82, unit: '%', change: -0.05, direction: 'down', source: 'FRED', updated: 'Apr 2026', history: spark(24, 7.0, 0.15), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  // ═══ INFLATION ═══
  { id: 'CPIAUCSL', name: 'CPI (YoY)', value: 2.40, unit: '%', change: -0.10, direction: 'down', source: 'BLS', updated: 'Mar 2026', history: spark(24, 3.5, 0.12), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'CPILFESL', name: 'Core CPI (YoY)', value: 2.80, unit: '%', change: -0.05, direction: 'down', source: 'BLS', updated: 'Mar 2026', history: spark(24, 3.8, 0.1), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'PCEPI', name: 'PCE (YoY)', value: 2.30, unit: '%', change: -0.08, direction: 'down', source: 'BEA', updated: 'Feb 2026', history: spark(24, 3.2, 0.12), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'PCEPILFE', name: 'Core PCE (YoY)', value: 2.60, unit: '%', change: -0.05, direction: 'down', source: 'BEA', updated: 'Feb 2026', history: spark(24, 3.0, 0.1), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'PPIFIS', name: 'PPI Final Demand (YoY)', value: 1.90, unit: '%', change: -0.15, direction: 'down', source: 'BLS', updated: 'Mar 2026', history: spark(24, 2.5, 0.2), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'CUSR0000SAH1', name: 'Shelter CPI', value: 3.80, unit: '% YoY', change: -0.20, direction: 'down', source: 'BLS', updated: 'Mar 2026', history: spark(24, 5.5, 0.2), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  // ═══ GROWTH ═══
  { id: 'A191RL1Q225SBEA', name: 'Real GDP Growth', value: 2.10, unit: '% QoQ', change: -0.30, direction: 'down', source: 'BEA', updated: 'Q4 2025', history: spark(12, 2.5, 0.4), historyLabels: ['Q223','Q323','Q423','Q124','Q224','Q324','Q424','Q125','Q225','Q325','Q425','Q126'] },
  { id: 'GDP', name: 'Nominal GDP', value: 29.2, unit: 'T', change: 0.4, direction: 'up', source: 'BEA', updated: 'Q4 2025', history: spark(12, 27.0, 0.3), historyLabels: ['Q223','Q323','Q423','Q124','Q224','Q324','Q424','Q125','Q225','Q325','Q425','Q126'] },
  { id: 'IPMAN', name: 'Industrial Production', value: -0.20, unit: '% MoM', change: -0.30, direction: 'down', source: 'Fed', updated: 'Mar 2026', history: spark(24, 0.3, 0.4), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'M2SL', name: 'M2 Money Supply', value: 21.8, unit: 'T', change: 0.1, direction: 'up', source: 'FRED', updated: 'Mar 2026', history: spark(24, 21.0, 0.1), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'HOUST', name: 'Housing Starts', value: 1.32, unit: 'M', change: -0.05, direction: 'down', source: 'Census', updated: 'Mar 2026', history: spark(24, 1.4, 0.1), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'RSAFS', name: 'Retail Sales', value: 0.40, unit: '% MoM', change: 0.15, direction: 'up', source: 'Census', updated: 'Mar 2026', history: spark(24, 0.3, 0.5), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  // ═══ LABOR ═══
  { id: 'UNRATE', name: 'Unemployment Rate', value: 4.20, unit: '%', change: 0.10, direction: 'up', source: 'BLS', updated: 'Mar 2026', history: spark(24, 3.8, 0.08), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'PAYEMS', name: 'Nonfarm Payrolls', value: 185, unit: 'K', change: -42, direction: 'down', source: 'BLS', updated: 'Mar 2026', history: spark(24, 220, 40), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'CES0500000003', name: 'Avg Hourly Earnings', value: 3.50, unit: '% YoY', change: -0.10, direction: 'down', source: 'BLS', updated: 'Mar 2026', history: spark(24, 4.2, 0.15), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'ICSA', name: 'Initial Claims', value: 218, unit: 'K', change: 3, direction: 'up', source: 'DOL', updated: 'Apr 2026', history: spark(24, 215, 15), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'U6RATE', name: 'U6 Underemployment', value: 7.80, unit: '%', change: 0.15, direction: 'up', source: 'BLS', updated: 'Mar 2026', history: spark(24, 7.2, 0.15), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'CIVPART', name: 'Labor Participation', value: 62.50, unit: '%', change: -0.05, direction: 'down', source: 'BLS', updated: 'Mar 2026', history: spark(24, 62.6, 0.1), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  // ═══ MONEY ═══
  { id: 'M1SL', name: 'M1 Money Supply', value: 18.1, unit: 'T', change: 0.05, direction: 'up', source: 'FRED', updated: 'Mar 2026', history: spark(24, 17.8, 0.1), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'DTWEXBGS', name: 'US Dollar Index (DXY)', value: 103.42, unit: '', change: 0.25, direction: 'up', source: 'FRED', updated: 'Live', history: spark(24, 102, 0.8), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'DPCREDIT', name: 'Bank Credit Growth', value: 1.80, unit: '% YoY', change: -0.20, direction: 'down', source: 'Fed', updated: 'Mar 2026', history: spark(24, 3.5, 0.3), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'T10YIE', name: 'Breakeven Inflation', value: 2.32, unit: '%', change: 0.03, direction: 'up', source: 'FRED', updated: 'Apr 2026', history: spark(24, 2.3, 0.08), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  // ═══ RISK ═══
  { id: 'SP500', name: 'S&P 500', value: 5238, unit: '', change: 28, direction: 'up', source: 'FRED', updated: 'Live', history: spark(24, 4800, 120), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'VIXCLS', name: 'VIX Index', value: 17.48, unit: '', change: -0.46, direction: 'down', source: 'CBOE', updated: 'Live', history: spark(24, 20, 2), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'BAMLH0A0HYM2', name: 'HY Credit Spread', value: 342, unit: 'bps', change: 12, direction: 'up', source: 'FRED', updated: 'Apr 2026', history: spark(24, 380, 25), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'TEDRATE', name: 'TED Spread', value: 0.18, unit: '%', change: 0.02, direction: 'up', source: 'FRED', updated: 'Apr 2026', history: spark(24, 0.2, 0.05), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'DCOILWTICO', name: 'WTI Crude', value: 78.40, unit: '$', change: -1.20, direction: 'down', source: 'EIA', updated: 'Live', history: spark(24, 75, 3), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'GOLDPMGBD228NLBM', name: 'Gold', value: 2342, unit: '$', change: 12, direction: 'up', source: 'FRED', updated: 'Live', history: spark(24, 2100, 60), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'UMCSENT', name: 'Consumer Sentiment', value: 77.2, unit: '', change: -1.5, direction: 'down', source: 'Michigan', updated: 'Apr 2026', history: spark(24, 68, 3), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'CSCICP03USM665S', name: 'Consumer Confidence', value: 104.7, unit: '', change: -2.3, direction: 'down', source: 'Conference Board', updated: 'Mar 2026', history: spark(24, 100, 5), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
  { id: 'RECPROUSM156N', name: 'Recession Prob (6M)', value: 15, unit: '%', change: 3, direction: 'up', source: 'NY Fed', updated: 'Mar 2026', history: spark(24, 25, 5), historyLabels: ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25','Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'] },
];

export async function macroSeries(id?: string): Promise<MacroSeries[]> {
  const keys = id ? [id] : MACRO_DEFS.map((m) => m.id);

  macroFeedLive = false;
  macroFeedLastError = null;

  const results = await Promise.all(
    keys.map(async (key): Promise<MacroSeries | null> => {
      const series = await tryEngine((a) => a.macroSeries(key, '5Y'));
      if (!series) return null;

      const raw = Array.isArray((series as { data?: unknown }).data)
        ? ((series as { data: Array<{ date: string; value: number }> }).data as Array<{ date: string; value: number }>)
        : [];
      const cleaned = raw
        .map((p) => ({ date: String(p.date ?? ''), value: Number(p.value ?? NaN) }))
        .filter((p) => Number.isFinite(p.value));
      let data = transformMacroPointsForUi(key, cleaned);
      if (data.length === 0 && cleaned.length > 0) data = cleaned;

      const last = data[data.length - 1];
      const prev = data[data.length - 2];
      const value = Number(last?.value ?? NaN);
      const change = Number.isFinite(value) && prev ? value - Number(prev.value ?? 0) : 0;
      const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
      const history = data.slice(-24).map((p) => Number(p.value ?? 0));
      const historyLabels = data.slice(-24).map((p) => String(p.date ?? '').slice(0, 7));

      const def = MACRO_DEFS.find((m) => m.id === key);
      return {
        id: (series as { key?: string }).key ?? key,
        name: (series as { name?: string }).name ?? def?.name ?? key,
        value: Number.isFinite(value) ? value : 0,
        unit: def?.unit ?? (series as { unit?: string }).unit ?? '',
        change,
        direction,
        source: 'FRED',
        updated: (series as { lastUpdated?: string }).lastUpdated ?? new Date().toISOString(),
        history,
        historyLabels,
      };
    }),
  );

  const engineRows = results.filter((x): x is MacroSeries => x != null);
  const byId = new Map(engineRows.map((r) => [r.id, r]));

  if (engineRows.length > 0) {
    macroFeedLive = true;
    macroFeedLastOkMs = Date.now();
  } else {
    macroFeedLive = false;
    macroFeedLastError = 'engine_macro_unavailable';
  }

  if (id) {
    const merged = MACRO_DEFS.filter((m) => m.id === id).map((def) => byId.get(def.id) ?? def);
    return merged;
  }

  return MACRO_DEFS.map((def) => byId.get(def.id) ?? def);
}

// ═══════════════════════════════════════════════════════════
// CORPORATE JETS
// ═══════════════════════════════════════════════════════════

export async function corporateJets(): Promise<JetPosition[]> {
  lastCorporateJetsTop50 = [];
  lastCorporateJetsMetrics = null;

  // Prefer engine-proxy (getTradingAdapter) when available.
  const { value: jets, error } = await tryEngineDetailed((a) => a.getCorporateJets());
  if (Array.isArray(jets) && jets.length > 0) {
    intelFeedLive.corporateJets = true;
    intelFeedLastOkMs.corporateJets = Date.now();
    intelFeedLastError.corporateJets = null;
    const top50 = jetPositionsToCorporateTop50(jets, 'engine_opensky');
    lastCorporateJetsTop50 = top50;
    lastCorporateJetsMetrics = computeCorporateJetsMetrics(
      jets.length,
      top50,
      null,
      'engine_intel_path_no_adsb_enrichment',
      'engine_opensky',
    );
    return jets;
  }

  // Fallback: intel-proxy (OpenSky + optional ADS-B enrichment, Top 50 bundle).
  try {
    if (import.meta.env.VITE_USE_ENGINE_EDGE === 'true') {
      const bundle = await fetchIntelCorporateJetsBundle();
      if (bundle.positions.length > 0) {
        intelFeedLive.corporateJets = true;
        intelFeedLastOkMs.corporateJets = Date.now();
        intelFeedLastError.corporateJets = null;
        lastCorporateJetsTop50 = bundle.top50;
        lastCorporateJetsMetrics = bundle.metrics;
        return bundle.positions;
      }
    }
  } catch (e) {
    intelFeedLastError.corporateJets = e instanceof Error ? e.message : String(e);
  }

  intelFeedLive.corporateJets = false;
  intelFeedLastError.corporateJets = intelFeedLastError.corporateJets ?? error ?? 'not_live';
  return [];
}

// ═══════════════════════════════════════════════════════════
// VESSEL STREAM
// ═══════════════════════════════════════════════════════════

export async function vesselStream(): Promise<{ vessels: Vessel[]; alerts: VesselAlert[] }> {
  const { value: snap, error } = await tryEngineDetailed((a) => a.getVesselStream());
  if (snap && Array.isArray((snap as any).vessels) && Array.isArray((snap as any).alerts)) {
    const v = (snap as any).vessels as Vessel[];
    const a = (snap as any).alerts as VesselAlert[];
    // Empty AIS snapshot is not "live" — otherwise the map shows chokepoints only (misleading).
    if (v.length > 0 || a.length > 0) {
      intelFeedLive.vesselStream = true;
      intelFeedLastOkMs.vesselStream = Date.now();
      intelFeedLastError.vesselStream = null;
      return snap as { vessels: Vessel[]; alerts: VesselAlert[] };
    }
    intelFeedLastError.vesselStream = error ?? 'ais_empty_snapshot';
  }

  // Fallback: intel-proxy (when supported). This is currently disabled in intel-proxy for AISStream websockets,
  // but if you switch intel-proxy to an HTTP snapshot provider, this instantly becomes live without touching UI.
  try {
    if (import.meta.env.VITE_USE_ENGINE_EDGE === 'true') {
      const data = await callIntelProxy<{ vessels: Vessel[]; alerts: VesselAlert[] }>('vesselStream', {});
      if (data && Array.isArray((data as any).vessels) && Array.isArray((data as any).alerts)) {
        const v = (data as any).vessels as Vessel[];
        const a = (data as any).alerts as VesselAlert[];
        if (v.length > 0 || a.length > 0) {
          intelFeedLive.vesselStream = true;
          intelFeedLastOkMs.vesselStream = Date.now();
          intelFeedLastError.vesselStream = null;
          return data;
        }
      }
    }
  } catch (e) {
    intelFeedLastError.vesselStream = e instanceof Error ? e.message : String(e);
  }

  intelFeedLive.vesselStream = false;
  intelFeedLastError.vesselStream = intelFeedLastError.vesselStream ?? error ?? 'not_live';
  return { vessels: [], alerts: [] };
}

// ═══════════════════════════════════════════════════════════
// WHALE TRANSACTIONS
// ═══════════════════════════════════════════════════════════

export async function whaleTransactions(): Promise<WhaleTx[]> {
  // Prefer Supabase Edge snapshot if enabled, fallback to stub.
  try {
    if (import.meta.env.VITE_USE_ENGINE_EDGE === 'true') {
      const txs = await callIntelProxy<WhaleTx[]>('whaleTransactions', {})
      if (Array.isArray(txs)) {
        intelFeedLive.whaleTransactions = true;
        intelFeedLastOkMs.whaleTransactions = Date.now();
        intelFeedLastError.whaleTransactions = null;
        return txs
      }
    }
  } catch (e) {
    // fall through to stub
    intelFeedLastError.whaleTransactions = e instanceof Error ? e.message : String(e);
  }
  intelFeedLive.whaleTransactions = false;
  if (!intelFeedLastError.whaleTransactions) intelFeedLastError.whaleTransactions = 'not_live';
  return [];
}

// ═══════════════════════════════════════════════════════════
// DARK POOL PRINTS
// ═══════════════════════════════════════════════════════════

/** PLACEHOLDER — BLOCKER: no `getTradingAdapter()` / engine method for dark pool; FMP short-volume not wired. */
export async function darkPoolPrints(_symbol?: string): Promise<DarkPoolPrint[]> {
  // TODO: FMP /short-volume-ratio/{symbol} as proxy
  const syms = ['SPY','QQQ','IWM','AAPL','MSFT','NVDA','TSLA','AMZN','META','GOOGL','AMD','INTC','NFLX','CRM','JPM','GS','BAC','XOM','CVX','JNJ'];
  return syms.map(s => {
    const price = rand(50, 600);
    const size = randInt(50000, 2000000);
    return {
      symbol: s,
      price: Math.round(price * 100) / 100,
      size,
      notional: Math.round(price * size),
      time: `${randInt(9, 16)}:${String(randInt(0, 59)).padStart(2, '0')}`,
      side: Math.random() > 0.5 ? 'buy' : 'sell' as 'buy' | 'sell',
    };
  }).sort((a, b) => b.notional - a.notional);
}

// ═══════════════════════════════════════════════════════════
// POLYMARKET MARKETS
// ═══════════════════════════════════════════════════════════

/** PLACEHOLDER — use `gammaPublicSearch` from this module for live Gamma search; list view not wired to engine. */
export async function polymarketMarkets(): Promise<PolymarketMarket[]> {
  // TODO: Polymarket Gamma API — /markets
  return [
    { id: '1', question: 'Will Trump win the 2028 US Presidential Election?', category: 'Politics', asset: 'TRUMP-2028', volume24h: 4200000, yesPrice: 0.62, noPrice: 0.38, endDate: 'Nov 5, 2028', liquidity: 8900000 },
    { id: '2', question: 'Will Fed cut rates in May 2026?', category: 'Rates', asset: 'FED-MAY-2026', volume24h: 2100000, yesPrice: 0.78, noPrice: 0.22, endDate: 'May 7, 2026', liquidity: 5400000 },
    { id: '3', question: 'Will Bitcoin hit $100K before July 2026?', category: 'Crypto', asset: 'BTC-100K', volume24h: 3800000, yesPrice: 0.45, noPrice: 0.55, endDate: 'Jun 30, 2026', liquidity: 7200000 },
    { id: '4', question: 'Will Russia-Ukraine ceasefire be signed in 2026?', category: 'Geopolitics', asset: 'RU-UA-CEASEFIRE', volume24h: 1500000, yesPrice: 0.34, noPrice: 0.66, endDate: 'Dec 31, 2026', liquidity: 3100000 },
    { id: '5', question: 'Will NVDA market cap exceed $5T in 2026?', category: 'Crypto', asset: 'NVDA-5T', volume24h: 2800000, yesPrice: 0.28, noPrice: 0.72, endDate: 'Dec 31, 2026', liquidity: 6100000 },
    { id: '6', question: 'Will Tesla FSD achieve Level 4 in 2026?', category: 'Tech', asset: 'TSLA-FSD-L4', volume24h: 1200000, yesPrice: 0.19, noPrice: 0.81, endDate: 'Dec 31, 2026', liquidity: 2800000 },
    { id: '7', question: 'Will WTI Crude exceed $90 before Q3 2026?', category: 'Commodity', asset: 'WTI-90', volume24h: 900000, yesPrice: 0.41, noPrice: 0.59, endDate: 'Jun 30, 2026', liquidity: 1900000 },
    { id: '8', question: 'Will S&P 500 close above 8000 in 2026?', category: 'Macro', asset: 'SPX-8000', volume24h: 3400000, yesPrice: 0.55, noPrice: 0.45, endDate: 'Dec 31, 2026', liquidity: 7800000 },
  ];
}

export async function polymarketNews(): Promise<PolymarketNewsItem[]> {
  return [
    { title: 'Trump announces new tariffs on EU goods', source: 'Bloomberg', timestamp: '10 min ago', relatedMarket: 'TRUMP-2028' },
    { title: 'Fed officials signal patience on rate cuts', source: 'Reuters', timestamp: '25 min ago', relatedMarket: 'FED-MAY-2026' },
    { title: 'Bitcoin ETFs see $400M inflows', source: 'CoinDesk', timestamp: '45 min ago', relatedMarket: 'BTC-100K' },
    { title: 'Peace talks stall in Geneva', source: 'FT', timestamp: '1h ago', relatedMarket: 'RU-UA-CEASEFIRE' },
    { title: 'NVDA Blackwell demand exceeds supply 3x', source: 'TechCrunch', timestamp: '2h ago', relatedMarket: 'NVDA-5T' },
  ];
}

// ═══════════════════════════════════════════════════════════
// AI DATA CENTERS
// ═══════════════════════════════════════════════════════════

/** PLACEHOLDER — BLOCKER: no Supabase `data_centers` table read in engine; demo rows for map UI. */
export async function aiDataCenters(): Promise<DataCenter[]> {
  // TODO: Supabase table 'data_centers'
  return [
    { id: '1', name: 'Stargate Abilene', operator: 'xAI / Oracle', operatorColor: '#8b5cf6', city: 'Abilene, TX', country: 'USA', lat: 32.4, lon: -99.7, capacityMW: 1200, gpuCount: 1000000, status: 'under_construction', linkedTickers: ['ORCL','TSLA'], yearOnline: '2026' },
    { id: '2', name: 'Colossus Memphis', operator: 'xAI', operatorColor: '#8b5cf6', city: 'Memphis, TN', country: 'USA', lat: 35.1, lon: -89.9, capacityMW: 800, gpuCount: 300000, status: 'operational', linkedTickers: ['TSLA'], yearOnline: '2025' },
    { id: '3', name: 'Mount Pleasant', operator: 'Microsoft', operatorColor: '#3b82f6', city: 'Mount Pleasant, WI', country: 'USA', lat: 42.7, lon: -87.8, capacityMW: 1000, gpuCount: 500000, status: 'under_construction', linkedTickers: ['MSFT'], yearOnline: '2026' },
    { id: '4', name: 'Hyperion LA', operator: 'CoreWeave', operatorColor: '#06b6d4', city: 'Los Angeles, CA', country: 'USA', lat: 34.0, lon: -118.2, capacityMW: 600, gpuCount: 250000, status: 'operational', linkedTickers: ['CRWV'], yearOnline: '2025' },
    { id: '5', name: 'Project Eos', operator: 'Meta', operatorColor: '#2563eb', city: 'Richmond, IN', country: 'USA', lat: 39.8, lon: -84.9, capacityMW: 2000, gpuCount: 1300000, status: 'under_construction', linkedTickers: ['META'], yearOnline: '2027' },
    { id: '6', name: 'Wapato Creek', operator: 'Amazon', operatorColor: '#f97316', city: 'Boardman, OR', country: 'USA', lat: 45.8, lon: -119.7, capacityMW: 960, gpuCount: 410000, status: 'under_construction', linkedTickers: ['AMZN'], yearOnline: '2026' },
    { id: '7', name: 'Columbus', operator: 'Google', operatorColor: '#eab308', city: 'Columbus, OH', country: 'USA', lat: 39.9, lon: -82.9, capacityMW: 500, gpuCount: 200000, status: 'operational', linkedTickers: ['GOOGL'], yearOnline: '2025' },
    { id: '8', name: 'Reno Technological', operator: 'NVIDIA', operatorColor: '#22c55e', city: 'Reno, NV', country: 'USA', lat: 39.5, lon: -119.8, capacityMW: 150, gpuCount: 80000, status: 'operational', linkedTickers: ['NVDA'], yearOnline: '2024' },
    { id: '9', name: 'Crusoe Energy', operator: 'Crusoe', operatorColor: '#22c55e', city: 'Odessa, TX', country: 'USA', lat: 31.8, lon: -102.3, capacityMW: 200, gpuCount: 100000, status: 'operational', linkedTickers: ['NVDA'], yearOnline: '2024' },
    { id: '10', name: 'Glasgow AI Hub', operator: 'Microsoft', operatorColor: '#3b82f6', city: 'Glasgow', country: 'UK', lat: 55.8, lon: -4.2, capacityMW: 150, gpuCount: 60000, status: 'announced', linkedTickers: ['MSFT'], yearOnline: '2027' },
    { id: '11', name: 'Fujisawa', operator: 'NVIDIA', operatorColor: '#22c55e', city: 'Fujisawa', country: 'Japan', lat: 35.3, lon: 139.4, capacityMW: 300, gpuCount: 160000, status: 'under_construction', linkedTickers: ['NVDA','SFTBF'], yearOnline: '2026' },
    { id: '12', name: 'Abidjan Compute', operator: 'DataVolt', operatorColor: '#f97316', city: 'Abidjan', country: 'Ivory Coast', lat: 5.3, lon: -4.0, capacityMW: 500, gpuCount: 250000, status: 'under_construction', linkedTickers: [], yearOnline: '2026' },
    { id: '13', name: 'Horizon Plains', operator: 'Microsoft', operatorColor: '#3b82f6', city: 'Harper County, KS', country: 'USA', lat: 37.1, lon: -98.0, capacityMW: 2000, gpuCount: 1300000, status: 'under_construction', linkedTickers: ['MSFT'], yearOnline: '2027' },
    { id: '14', name: 'Odense AI', operator: 'Meta', operatorColor: '#2563eb', city: 'Odense', country: 'Denmark', lat: 55.4, lon: 10.3, capacityMW: 200, gpuCount: 130000, status: 'under_construction', linkedTickers: ['META'], yearOnline: '2026' },
    { id: '15', name: 'Luleå Green', operator: 'NVIDIA', operatorColor: '#22c55e', city: 'Luleå', country: 'Sweden', lat: 65.5, lon: 22.1, capacityMW: 500, gpuCount: 320000, status: 'operational', linkedTickers: ['NVDA'], yearOnline: '2025' },
  ];
}

// ═══════════════════════════════════════════════════════════
// EARNINGS CALENDAR
// ═══════════════════════════════════════════════════════════

export async function earnings(from: string, to: string): Promise<EarningsEvent[]> {
  const items = (await tryEngine((a) => a.getEarningsCalendar(from, to))) ?? [];
  if (items.length > 0) {
    return items.map((e) => ({
      ticker: e.ticker,
      company: e.company,
      date: e.date,
      time: (e.time === 'BMO' || e.time === 'AMC' ? e.time : 'BMO'),
      epsEstimate: e.epsEstimate ?? null,
      revenueEstimate: e.revenueEstimate ?? null,
      epsSurprise: e.epsSurprise ?? null,
      impact: e.impact,
      sector: e.sector,
    }));
  }

  const companies = [
    { t: 'AAPL', c: 'Apple Inc', s: 'Technology', e: 1.55, r: 94500 },
    { t: 'MSFT', c: 'Microsoft', s: 'Technology', e: 3.20, r: 68000 },
    { t: 'NVDA', c: 'NVIDIA Corp', s: 'Technology', e: 0.92, r: 31000 },
    { t: 'AMZN', c: 'Amazon', s: 'Consumer', e: 1.25, r: 158000 },
    { t: 'GOOGL', c: 'Alphabet', s: 'Technology', e: 1.90, r: 87000 },
    { t: 'META', c: 'Meta Platforms', s: 'Technology', e: 5.80, r: 42500 },
    { t: 'TSLA', c: 'Tesla Inc', s: 'Auto', e: 0.72, r: 25800 },
    { t: 'JPM', c: 'JPMorgan Chase', s: 'Finance', e: 4.85, r: 43500 },
    { t: 'V', c: 'Visa Inc', s: 'Finance', e: 2.45, r: 9100 },
    { t: 'WMT', c: 'Walmart', s: 'Consumer', e: 0.62, r: 180000 },
    { t: 'JNJ', c: 'Johnson & Johnson', s: 'Health', e: 2.68, r: 22500 },
    { t: 'XOM', c: 'Exxon Mobil', s: 'Energy', e: 2.10, r: 88000 },
    { t: 'MA', c: 'Mastercard', s: 'Finance', e: 3.35, r: 7200 },
    { t: 'PG', c: 'Procter & Gamble', s: 'Consumer', e: 1.55, r: 21500 },
    { t: 'HD', c: 'Home Depot', s: 'Consumer', e: 3.65, r: 39500 },
    { t: 'BAC', c: 'Bank of America', s: 'Finance', e: 0.82, r: 25500 },
    { t: 'ABBV', c: 'AbbVie', s: 'Health', e: 2.42, r: 15200 },
    { t: 'PFE', c: 'Pfizer', s: 'Health', e: 0.68, r: 14800 },
    { t: 'KO', c: 'Coca-Cola', s: 'Consumer', e: 0.72, r: 11800 },
    { t: 'DIS', c: 'Disney', s: 'Media', e: 1.15, r: 22800 },
    { t: 'NFLX', c: 'Netflix', s: 'Media', e: 5.10, r: 10400 },
    { t: 'AMD', c: 'AMD', s: 'Technology', e: 0.72, r: 7200 },
    { t: 'CRM', c: 'Salesforce', s: 'Technology', e: 2.60, r: 9600 },
    { t: 'INTC', c: 'Intel', s: 'Technology', e: 0.12, r: 13200 },
    { t: 'GS', c: 'Goldman Sachs', s: 'Finance', e: 12.50, r: 14800 },
    { t: 'IBM', c: 'IBM', s: 'Technology', e: 2.20, r: 15200 },
    { t: 'GE', c: 'GE Aerospace', s: 'Industrial', e: 1.35, r: 9800 },
    { t: 'BA', c: 'Boeing', s: 'Industrial', e: -0.95, r: 19800 },
    { t: 'C', c: 'Citigroup', s: 'Finance', e: 1.45, r: 21500 },
    { t: 'MRK', c: 'Merck', s: 'Health', e: 2.18, r: 16200 },
    { t: 'CVX', c: 'Chevron', s: 'Energy', e: 2.55, r: 49500 },
    { t: 'PEP', c: 'PepsiCo', s: 'Consumer', e: 1.95, r: 20200 },
    { t: 'T', c: 'AT&T', s: 'Telecom', e: 0.58, r: 30500 },
    { t: 'VZ', c: 'Verizon', s: 'Telecom', e: 1.18, r: 33500 },
    { t: 'WFC', c: 'Wells Fargo', s: 'Finance', e: 1.25, r: 20500 },
    { t: 'UNH', c: 'UnitedHealth', s: 'Health', e: 7.25, r: 112000 },
    { t: 'COST', c: 'Costco', s: 'Consumer', e: 4.05, r: 62800 },
    { t: 'AVGO', c: 'Broadcom', s: 'Technology', e: 1.50, r: 15800 },
    { t: 'ADBE', c: 'Adobe', s: 'Technology', e: 4.45, r: 5800 },
    { t: 'MCD', c: "McDonald's", s: 'Consumer', e: 3.05, r: 6700 },
  ];
  return companies.map((c, i) => ({
    ticker: c.t,
    company: c.c,
    date: new Date(Date.now() + (i % 14) * 86400000).toISOString().split('T')[0],
    time: i % 2 === 0 ? 'BMO' as const : 'AMC' as const,
    epsEstimate: c.e,
    revenueEstimate: c.r * 1000000,
    epsSurprise: rand(-0.15, 0.20),
    impact: (i < 10 ? 'high' : i < 25 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
    sector: c.s,
  }));
}

// ═══════════════════════════════════════════════════════════
// INSIDER TRADES
// ═══════════════════════════════════════════════════════════

export async function insiderTrades(_symbol?: string): Promise<InsiderTrade[]> {
  // Prefer Supabase Edge (FMP latest/search rows). Omit symbol → market-wide `latest` feed (not only AAPL).
  const sym = _symbol?.trim();
  const args: Record<string, unknown> = sym ? { symbol: sym.toUpperCase() } : {};
  try {
    if (import.meta.env.VITE_USE_ENGINE_EDGE === 'true') {
      const rows = await callIntelProxy<Array<{ ticker: string; insider: string; type: 'BUY' | 'SELL'; value: number; date: string }>>(
        'insiderTrades',
        args,
      );
      if (Array.isArray(rows) && rows.length > 0) {
        intelFeedLive.insiderTrades = true;
        intelFeedLastOkMs.insiderTrades = Date.now();
        intelFeedLastError.insiderTrades = null;
        return rows.map((r) => ({
          ticker: r.ticker,
          insider: r.insider,
          role: '—',
          type: r.type,
          shares: 0,
          value: r.value,
          date: r.date,
        }));
      }
    }
  } catch (e) {
    // fall through
    intelFeedLastError.insiderTrades = e instanceof Error ? e.message : String(e);
  }
  intelFeedLive.insiderTrades = false;
  if (!intelFeedLastError.insiderTrades) intelFeedLastError.insiderTrades = 'not_live';
  return [];
}

// ═══════════════════════════════════════════════════════════
// SENATE TRADES
// ═══════════════════════════════════════════════════════════

export async function senateTrades(): Promise<SenateTrade[]> {
  // TODO: Senate Stock Watcher API / bulk data
  return [
    { politician: 'Nancy Pelosi', chamber: 'House', ticker: 'NVDA', direction: 'BUY', size: '$500K - $1M', date: 'Apr 19, 2026' },
    { politician: 'Mike Johnson', chamber: 'House', ticker: 'PLTR', direction: 'BUY', size: '$100K - $250K', date: 'Apr 17, 2026' },
    { politician: 'Tommy Tuberville', chamber: 'Senate', ticker: 'XOM', direction: 'BUY', size: '$50K - $100K', date: 'Apr 14, 2026' },
    { politician: 'Josh Gottheimer', chamber: 'House', ticker: 'MSFT', direction: 'SELL', size: '$250K - $500K', date: 'Apr 12, 2026' },
    { politician: 'Dan Crenshaw', chamber: 'House', ticker: 'RTX', direction: 'BUY', size: '$15K - $50K', date: 'Apr 10, 2026' },
    { politician: 'Markwayne Mullin', chamber: 'Senate', ticker: 'BRK.B', direction: 'BUY', size: '$100K - $250K', date: 'Apr 8, 2026' },
    { politician: 'Ro Khanna', chamber: 'House', ticker: 'TSLA', direction: 'SELL', size: '$50K - $100K', date: 'Apr 5, 2026' },
    { politician: 'Rick Scott', chamber: 'Senate', ticker: 'JPM', direction: 'BUY', size: '$500K - $1M', date: 'Apr 3, 2026' },
  ];
}

// ═══════════════════════════════════════════════════════════
// NEWS
// ═══════════════════════════════════════════════════════════

export async function news(_tickers?: string[], options?: { limit?: number }): Promise<NewsItem[]> {
  const tickers = Array.isArray(_tickers) && _tickers.length > 0 ? _tickers : undefined;
  const symbol = tickers && tickers.length === 1 ? tickers[0] : undefined;
  const limit = Math.min(120, Math.max(1, options?.limit ?? 50));

  const { value: items, error: newsErr } = await tryEngineDetailed((a) => a.news(symbol, { limit }));
  if (items && Array.isArray(items) && items.length > 0) {
    newsFeedLive = true;
    newsFeedLastOkMs = Date.now();
    newsFeedLastError = null;
    return (items as any[]).map((n) => ({
      id: String(n.id ?? Math.random()),
      headline: String(n.title ?? ''),
      summary: String(n.summary ?? ''),
      source: String(n.source ?? '—'),
      timestamp: String(n.publishedAt ?? new Date().toISOString()),
      sentiment: (n.sentiment ?? 'neutral') as 'bullish' | 'bearish' | 'neutral',
      tickers: n.symbol ? [String(n.symbol)] : [],
      category: String(n.category ?? 'News'),
      url: n.url ? String(n.url) : undefined,
    }));
  }

  newsFeedLive = false;
  newsFeedLastError = newsErr ?? (Array.isArray(items) && items.length === 0 ? 'engine_news_empty' : 'engine_news_unavailable');

  if (import.meta.env.VITE_USE_ENGINE_EDGE === 'true') {
    return [];
  }

  const agoIso = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  return [
    { id: '1', headline: 'Fed signals patience on rate cuts as inflation remains sticky', summary: 'Federal Reserve officials emphasized patience on interest rate cuts...', source: 'Reuters', timestamp: agoIso(10), sentiment: 'bearish', tickers: ['SPY','DXY'], category: 'Macro' },
    { id: '2', headline: 'Bitcoin breaks $90K as ETF inflows surge to 6-week high', summary: ' spot Bitcoin ETFs recorded net inflows of $480 million...', source: 'CoinDesk', timestamp: agoIso(15), sentiment: 'bullish', tickers: ['BTC','COIN'], category: 'Crypto' },
    { id: '3', headline: 'NVIDIA Blackwell demand exceeds supply by 3x', summary: 'CEO Jensen Huang confirmed demand is outpacing supply...', source: 'TechCrunch', timestamp: agoIso(22), sentiment: 'bullish', tickers: ['NVDA','AMD'], category: 'Stocks' },
    { id: '4', headline: 'ECB holds rates steady, signals June cut possible', summary: 'The European Central Bank kept its deposit rate at 2.50%...', source: 'Bloomberg', timestamp: agoIso(35), sentiment: 'neutral', tickers: ['EUR','DXY'], category: 'Forex' },
    { id: '5', headline: 'WTI crude drops below $78 on inventory build', summary: 'US crude inventories rose by 5.2 million barrels...', source: 'CNBC', timestamp: agoIso(45), sentiment: 'bearish', tickers: ['USO','XOM'], category: 'Commodities' },
  ];
}

// ═══════════════════════════════════════════════════════════
// SQUAWK HEADLINES
// ═══════════════════════════════════════════════════════════

/** PLACEHOLDER — BLOCKER: no squawk RSS provider wired. */
export async function squawkHeadlines(): Promise<{ text: string; time: string }[]> {
  // TODO: Financial Juice RSS / embed
  return [
    { text: 'Fed Chair Powell: "We are in no hurry to cut rates" — inflation still above target', time: '14:22:05' },
    { text: 'ECB President Lagarde signals June rate cut increasingly likely', time: '14:18:33' },
    { text: 'WTI crude breaks $79 as Middle East tensions escalate — 3 tankers rerouted', time: '14:15:12' },
    { text: 'NVIDIA +2.4% pre-market — Goldman raises PT to $1,100 on Blackwell demand', time: '14:11:48' },
    { text: 'Bitcoin ETF inflows: +$480M yesterday — BlackRock IBIT leads with $310M', time: '14:08:22' },
    { text: 'Treasury 10Y yield rises to 4.42% — ahead of $42B 10Y auction', time: '14:04:55' },
    { text: 'AAPL delays AI Siri to iOS 19 — features not ready for WWDC', time: '14:01:18' },
    { text: 'JPMorgan Q1 EPS $5.02 vs $4.72 est — Investment banking +18% YoY', time: '13:57:44' },
    { text: 'China Caixin Manufacturing PMI 51.2 vs 50.8 est — 3rd month of expansion', time: '13:54:09' },
    { text: 'Saudi Aramco extends 1M bpd voluntary cut through Q3 2026', time: '13:50:33' },
  ];
}

// ═══════════════════════════════════════════════════════════
// MARKET SCANNER
// ═══════════════════════════════════════════════════════════

export async function scannerRun(_filters: string[], _mode: 'any' | 'all', categories: string[]): Promise<ScannerResult[]> {
  const results = await tryEngine((a) => a.getScannerResults({ limit: 80 }));
  if (results && Array.isArray(results) && results.length > 0) {
    const out: ScannerResult[] = [];
    for (const r of results as any[]) {
      const priceMetric = Array.isArray(r.metrics) ? r.metrics.find((m: any) => String(m.name).toLowerCase() === 'price') : null;
      const changeMetric = Array.isArray(r.metrics) ? r.metrics.find((m: any) => String(m.name).toLowerCase() === 'change') : null;
      const volumeMetric = Array.isArray(r.metrics) ? r.metrics.find((m: any) => String(m.name).toLowerCase() === 'volume') : null;

      const symbol = String(r.symbol ?? '—');
      const price = Number(priceMetric?.value ?? 0);
      const change24h = Number(changeMetric?.value ?? 0);
      const volume = Number(volumeMetric?.value ?? 0);

      // Category mapping for existing UI table (kept simple/robust)
      let category = 'Indices';
      if (symbol.includes('/')) category = 'FX';
      if (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('SOL') || symbol.includes('XRP')) category = 'Crypto';
      if (['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'PLTR'].includes(symbol.toUpperCase())) category = 'Stocks';

      if (categories.length > 0) {
        const catMap: Record<string, string> = {
          Forex: 'FX',
          Crypto: 'Crypto',
          Indices: 'Indices',
          Metals: 'Metals',
          Energy: 'Energy',
          Bonds: 'Bonds',
        };
        const mapped = categories.map((c) => catMap[c] || c);
        if (!mapped.includes(category)) continue;
      }

      out.push({
        symbol,
        price,
        change24h,
        rsi: 50,
        volumeX: volume > 0 ? Math.round((1 + Math.log10(volume + 1) / 10) * 10) / 10 : 1,
        klv: String((r.signals?.[0] ?? '—')).slice(0, 12) || '—',
        sparkline: [],
        matchedFilters: _filters ?? [],
        category,
      });
    }
    if (out.length > 0) return out;
  }

  if (import.meta.env.VITE_USE_ENGINE_EDGE === 'true') {
    return [];
  }

  // Local / no Edge: demo grid when engine unavailable or empty.
  const symbols: ScannerResult[] = [
    { symbol: 'EUR/USD', price: 1.0842, change24h: -0.12, rsi: 42.3, volumeX: 1.2, klv: '1.0850', sparkline: spark(24, 1.08, 0.002), matchedFilters: ['RSI OB/OS','Key Level Proximity'], category: 'FX' },
    { symbol: 'GBP/USD', price: 1.2645, change24h: 0.35, rsi: 58.7, volumeX: 1.8, klv: '1.2650', sparkline: spark(24, 1.26, 0.003), matchedFilters: ['Volume Spike','EMA Cross'], category: 'FX' },
    { symbol: 'USD/JPY', price: 151.80, change24h: -0.45, rsi: 68.2, volumeX: 2.1, klv: '152.00', sparkline: spark(24, 151.5, 0.3), matchedFilters: ['RSI OB/OS','Volume > 2x Avg'], category: 'FX' },
    { symbol: 'XAU/USD', price: 2342.00, change24h: 1.85, rsi: 72.5, volumeX: 3.2, klv: '2345.00', sparkline: spark(24, 2320, 15), matchedFilters: ['Volume Spike','Golden Cross'], category: 'Metals' },
    { symbol: 'BTC/USD', price: 87400, change24h: 3.45, rsi: 65.8, volumeX: 4.5, klv: '88000', sparkline: spark(24, 86000, 800), matchedFilters: ['24h Change > 5%','Volume Spike'], category: 'Crypto' },
    { symbol: 'ETH/USD', price: 4120, change24h: 2.85, rsi: 61.2, volumeX: 3.8, klv: '4150', sparkline: spark(24, 4050, 40), matchedFilters: ['24h Change > 5%','MACD Cross'], category: 'Crypto' },
    { symbol: 'US30', price: 42150, change24h: -0.55, rsi: 48.5, volumeX: 1.1, klv: '42200', sparkline: spark(24, 42100, 80), matchedFilters: ['Mean Reversion'], category: 'Indices' },
    { symbol: 'NAS100', price: 19850, change24h: 0.95, rsi: 55.3, volumeX: 1.5, klv: '19900', sparkline: spark(24, 19750, 120), matchedFilters: ['EMA Cross'], category: 'Indices' },
    { symbol: 'USOIL', price: 78.40, change24h: -1.95, rsi: 35.8, volumeX: 2.3, klv: '78.50', sparkline: spark(24, 79.5, 0.5), matchedFilters: ['RSI OB/OS','Oversold Bounce'], category: 'Energy' },
    { symbol: 'XRP/USD', price: 0.5420, change24h: 6.85, rsi: 78.2, volumeX: 5.2, klv: '0.5500', sparkline: spark(24, 0.51, 0.01), matchedFilters: ['24h Change > 5%','Breakout Watch','Volume Spike'], category: 'Crypto' },
    { symbol: 'SOL/USD', price: 142.50, change24h: -2.35, rsi: 38.5, volumeX: 1.9, klv: '143.00', sparkline: spark(24, 144, 2), matchedFilters: ['Mean Reversion'], category: 'Crypto' },
    { symbol: 'NVDA', price: 892.50, change24h: 4.25, rsi: 71.8, volumeX: 2.8, klv: '900.00', sparkline: spark(24, 860, 15), matchedFilters: ['Breakout Watch','Volume Spike'], category: 'Stocks' },
    { symbol: 'AAPL', price: 168.20, change24h: -0.85, rsi: 45.2, volumeX: 0.9, klv: '168.50', sparkline: spark(24, 168.5, 1), matchedFilters: ['Consolidation Break'], category: 'Stocks' },
    { symbol: 'TSLA', price: 172.80, change24h: 2.15, rsi: 52.8, volumeX: 1.6, klv: '175.00', sparkline: spark(24, 170, 3), matchedFilters: ['ATR Expansion'], category: 'Stocks' },
    { symbol: 'PLTR', price: 22.40, change24h: -3.85, rsi: 32.5, volumeX: 2.1, klv: '22.50', sparkline: spark(24, 23, 0.3), matchedFilters: ['RSI OB/OS','Oversold Bounce'], category: 'Stocks' },
  ];

  if (categories.length > 0) {
    const catMap: Record<string, string> = {
      'Forex': 'FX', 'Crypto': 'Crypto', 'Indices': 'Indices',
      'Metals': 'Metals', 'Energy': 'Energy', 'Bonds': 'Bonds',
    };
    const mapped = categories.map(c => catMap[c] || c);
    return symbols.filter(s => mapped.includes(s.category));
  }
  return symbols;
}

// ═══════════════════════════════════════════════════════════
// QUANTLAB BACKTEST
// ═══════════════════════════════════════════════════════════

// TODO: runBacktest() moet via Web Worker isolatie om ghost state te voorkomen — worker per job, nooit hergebruiken, Promise-based return.
/** PLACEHOLDER — BLOCKER: no backtest engine on adapter. */
export async function runBacktest(_config: Record<string, unknown>): Promise<BacktestResult> {
  // TODO: Real backtest engine — Web Worker geisoleerd — worker per job, nooit hergebruiken, Promise-based return.
  const nTrades = 47;
  const trades: BacktestTrade[] = Array.from({ length: nTrades }, (_, i) => {
    const pnl = rand(-800, 2500);
    return {
      id: i + 1,
      direction: Math.random() > 0.5 ? 'LONG' : 'SHORT',
      entry: rand(50, 500),
      exit: rand(50, 500),
      pnl: Math.round(pnl * 100) / 100,
      rMultiple: Math.round((pnl / 500) * 100) / 100,
      exitReason: ['Take Profit', 'Stop Loss', 'Trailing Stop', 'Manual Close'][randInt(0, 4)],
      holdingPeriod: `${randInt(1, 48)}h`,
    };
  });

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const totalProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const equityCurve = [100000];
  for (const t of trades) {
    equityCurve.push(equityCurve[equityCurve.length - 1] + t.pnl);
  }

  return {
    netProfit: Math.round((equityCurve[equityCurve.length - 1] - 100000) * 100) / 100,
    winRate: Math.round((wins.length / nTrades) * 1000) / 10,
    profitFactor: Math.round((totalProfit / (totalLoss || 1)) * 100) / 100,
    maxDrawdown: Math.round(rand(5, 15) * 100) / 100,
    sharpeRatio: Math.round(rand(0.8, 2.5) * 100) / 100,
    sortinoRatio: Math.round(rand(1.0, 3.5) * 100) / 100,
    expectancy: Math.round((totalProfit / nTrades) * 100) / 100,
    calmarRatio: Math.round(rand(0.5, 2.0) * 100) / 100,
    rMultiple: Math.round((totalProfit / totalLoss) * 100) / 100,
    trades,
    equityCurve,
  };
}

// ═══════════════════════════════════════════════════════════
// HEATMAP — same scanner pipeline as MarketScanner (`getScannerResults`)
// ═══════════════════════════════════════════════════════════

export type HeatmapMarketRow = {
  symbol: string;
  label: string;
  category: 'FX' | 'Metals' | 'Energy' | 'Indices' | 'Crypto';
  change: number;
  price: number;
  volume: 'high' | 'avg' | 'low';
};

export async function heatmapMarketSnapshot(categories: string[]): Promise<HeatmapMarketRow[]> {
  const rows = await scannerRun([], 'any', categories);
  const mapCategory = (c: string): HeatmapMarketRow['category'] => {
    if (c === 'FX' || c === 'Metals' || c === 'Energy' || c === 'Indices' || c === 'Crypto') return c;
    return 'Indices';
  };
  return rows.map((r) => {
    const c = mapCategory(r.category);
    const vol: HeatmapMarketRow['volume'] = r.volumeX >= 2.5 ? 'high' : r.volumeX >= 1.2 ? 'avg' : 'low';
    return {
      symbol: String(r.symbol ?? '—').replace(/\//g, ''),
      label: String(r.symbol ?? '—'),
      category: c,
      change: r.change24h,
      price: r.price,
      volume: vol,
    };
  });
}

/** Supabase Edge `onboarding-options` (JWT + anon key). Not the trading `engine-proxy`. */
export async function fetchOnboardingOptions(): Promise<Record<string, unknown> | null> {
  try {
    await supabase.auth.refreshSession();
  } catch {
    /* ignore */
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;
  const base = import.meta.env.VITE_SUPABASE_URL ?? '';
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!base.trim() || !anon.trim()) return null;
  const url = `${base.replace(/\/$/, '')}/functions/v1/onboarding-options`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, apikey: anon } });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

/** Polymarket Gamma public REST — no Supabase secret; exposed here so UI never imports `@/lib/polymarketGamma` directly. */
export { gammaPublicSearch, normalizeSearchMarkets, formatTimeRemaining } from './polymarketGamma';

/** One row from Engine Ops “Live Data Proof” (same session + adapter paths as production). */
export type EngineOpsLiveProofRow = {
  proxy: 'engine-proxy' | 'intel-proxy';
  action: string;
  status: 'live' | 'empty' | 'error';
  ok: boolean;
  providerOrSource?: string;
  count?: number;
  errorSnippet?: string;
  /** Present for getChart proof rows — mirrors `ChartData.debug` or `ChartFetchError.debug`. */
  chartTrace?: ChartFetchDebugMeta;
  /** Present for corporateJets proof row after intel-proxy bundle. */
  intelJetsMetrics?: CorporateJetsMetrics;
};

function proofErrSnippet(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

async function pushGetChartProofRow(
  rows: EngineOpsLiveProofRow[],
  adapter: ReturnType<typeof getTradingAdapter>,
  symbol: string,
  timeframe: string,
  limit: number,
): Promise<void> {
  const action = `getChart(${symbol},${timeframe},${limit})`;
  try {
    const chart = await adapter.getChart(symbol, timeframe, limit);
    const n = Array.isArray((chart as { candles?: unknown }).candles) ? (chart as { candles: unknown[] }).candles.length : 0;
    const src = String((chart as { source?: string }).source ?? '').trim();
    const dbg = (chart as { debug?: ChartFetchDebugMeta }).debug;
    rows.push({
      proxy: 'engine-proxy',
      action,
      status: n > 0 ? 'live' : 'empty',
      ok: n > 0,
      count: n,
      providerOrSource: src || undefined,
      chartTrace: dbg,
    });
  } catch (e) {
    const dbg = e instanceof ChartFetchError ? e.debug : undefined;
    rows.push({
      proxy: 'engine-proxy',
      action,
      status: 'error',
      ok: false,
      errorSnippet: proofErrSnippet(e),
      chartTrace: dbg,
    });
  }
}

/** Best-effort: open WS, subscribe XAUUSD 1D; success if any server message or socket stays open until timeout. */
async function pushLiveEngineWsHandshakeRow(rows: EngineOpsLiveProofRow[]): Promise<void> {
  const action = 'liveEngineWs(XAUUSD,1D handshake)';
  const url = String(import.meta.env.VITE_LIVE_ENGINE_WS_URL ?? '').trim();
  if (!url) {
    rows.push({
      proxy: 'engine-proxy',
      action,
      status: 'empty',
      ok: false,
      errorSnippet: 'VITE_LIVE_ENGINE_WS_URL not set',
    });
    return;
  }
  if (typeof WebSocket === 'undefined') {
    rows.push({
      proxy: 'engine-proxy',
      action,
      status: 'empty',
      ok: false,
      errorSnippet: 'WebSocket unavailable',
    });
    return;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      let opened = false;
      const timer = window.setTimeout(() => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        if (opened) resolve();
        else reject(new Error('ws_open_timeout'));
      }, 4500);

      const finishOk = () => {
        window.clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve();
      };

      ws.onopen = () => {
        opened = true;
        try {
          ws.send(JSON.stringify({ type: 'subscribe', symbol: 'XAUUSD', timeframe: '1D' }));
        } catch (e) {
          window.clearTimeout(timer);
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      };
      ws.onmessage = () => {
        finishOk();
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error('websocket_error'));
      };
    });
    rows.push({
      proxy: 'engine-proxy',
      action,
      status: 'live',
      ok: true,
      providerOrSource: 'ws_open_or_message',
    });
  } catch (e) {
    rows.push({
      proxy: 'engine-proxy',
      action,
      status: 'error',
      ok: false,
      errorSnippet: proofErrSnippet(e),
    });
  }
}

/**
 * Temporary runtime proof for Engine Ops: same `getTradingAdapter()` + `intel-proxy` wiring as the app.
 * Does not log tokens or secrets.
 */
export async function runEngineOpsLiveProof(): Promise<EngineOpsLiveProofRow[]> {
  const adapter = getTradingAdapter();
  const rows: EngineOpsLiveProofRow[] = [];

  try {
    const data = await adapter.news(undefined, { limit: 25 });
    const n = Array.isArray(data) ? data.length : 0;
    const src0 = n > 0 ? String((data as { source?: string }[])[0]?.source ?? '').trim() : '';
    rows.push({
      proxy: 'engine-proxy',
      action: 'news',
      status: n > 0 ? 'live' : 'empty',
      ok: true,
      count: n,
      providerOrSource: src0 || undefined,
    });
  } catch (e) {
    rows.push({
      proxy: 'engine-proxy',
      action: 'news',
      status: 'error',
      ok: false,
      errorSnippet: proofErrSnippet(e),
    });
  }

  try {
    const data = await adapter.getScannerResults({ limit: 80 });
    const n = Array.isArray(data) ? data.length : 0;
    rows.push({
      proxy: 'engine-proxy',
      action: 'getScannerResults',
      status: n > 0 ? 'live' : 'empty',
      ok: true,
      count: n,
      providerOrSource: 'scanner_service',
    });
  } catch (e) {
    rows.push({
      proxy: 'engine-proxy',
      action: 'getScannerResults',
      status: 'error',
      ok: false,
      errorSnippet: proofErrSnippet(e),
    });
  }

  try {
    const series = await adapter.macroSeries('DGS10', '5Y');
    const pts = Array.isArray((series as { data?: unknown }).data) ? (series as { data: unknown[] }).data.length : 0;
    rows.push({
      proxy: 'engine-proxy',
      action: 'macroSeries(DGS10,5Y)',
      status: pts > 0 ? 'live' : 'empty',
      ok: true,
      count: pts,
      providerOrSource: String((series as { name?: string }).name ?? 'FRED'),
    });
  } catch (e) {
    rows.push({
      proxy: 'engine-proxy',
      action: 'macroSeries(DGS10,5Y)',
      status: 'error',
      ok: false,
      errorSnippet: proofErrSnippet(e),
    });
  }

  await pushGetChartProofRow(rows, adapter, 'XAUUSD', '1D', 120);
  await pushGetChartProofRow(rows, adapter, 'EURUSD', '1D', 120);
  await pushGetChartProofRow(rows, adapter, 'BTCUSD', '1D', 120);
  await pushLiveEngineWsHandshakeRow(rows);

  try {
    const jets = await corporateJets();
    const n = Array.isArray(jets) ? jets.length : 0;
    const m = getCorporateJetsMetrics();
    rows.push({
      proxy: 'intel-proxy',
      action: 'corporateJets',
      status: n > 0 ? 'live' : 'empty',
      ok: true,
      count: n,
      providerOrSource: m?.positionSource ?? 'OpenSky',
      intelJetsMetrics: m ?? undefined,
    });
  } catch (e) {
    rows.push({
      proxy: 'intel-proxy',
      action: 'corporateJets',
      status: 'error',
      ok: false,
      errorSnippet: proofErrSnippet(e),
    });
  }

  try {
    const list = await callIntelProxy<Array<{ ticker?: string }>>('insiderTrades', {});
    const n = Array.isArray(list) ? list.length : 0;
    rows.push({
      proxy: 'intel-proxy',
      action: 'insiderTrades',
      status: n > 0 ? 'live' : 'empty',
      ok: true,
      count: n,
      providerOrSource: 'FMP',
    });
  } catch (e) {
    rows.push({
      proxy: 'intel-proxy',
      action: 'insiderTrades',
      status: 'error',
      ok: false,
      errorSnippet: proofErrSnippet(e),
    });
  }

  try {
    const txs = await callIntelProxy<unknown[]>('whaleTransactions', {});
    const n = Array.isArray(txs) ? txs.length : 0;
    rows.push({
      proxy: 'intel-proxy',
      action: 'whaleTransactions',
      status: n > 0 ? 'live' : 'empty',
      ok: true,
      count: n,
      providerOrSource: 'WhaleAlert',
    });
  } catch (e) {
    rows.push({
      proxy: 'intel-proxy',
      action: 'whaleTransactions',
      status: 'error',
      ok: false,
      errorSnippet: proofErrSnippet(e),
    });
  }

  return rows;
}

/** Runtime flags after last fetch (intel/macro/news) + client env presence (no secret values). */
export function getLegacyAdapterFeedFlags() {
  return {
    macroFeedLive: isMacroFeedLive(),
    newsFeedLive: isNewsFeedLive(),
    newsFeedLastError: getNewsFeedLastError(),
    intelFeeds: {
      corporateJets: isIntelFeedLive('corporateJets'),
      vesselStream: isIntelFeedLive('vesselStream'),
      insiderTrades: isIntelFeedLive('insiderTrades'),
      whaleTransactions: isIntelFeedLive('whaleTransactions'),
    },
    viteUseEngineEdge: import.meta.env.VITE_USE_ENGINE_EDGE === 'true',
    viteLiveEngineWsConfigured: Boolean(String(import.meta.env.VITE_LIVE_ENGINE_WS_URL ?? '').trim()),
    viteTradingTerminalApiConfigured: Boolean(String(import.meta.env.VITE_TRADING_TERMINAL_API_URL ?? '').trim()),
    viteSupabaseClientConfigured: Boolean(
      String(import.meta.env.VITE_SUPABASE_URL ?? '').trim() && String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
    ),
  };
}
