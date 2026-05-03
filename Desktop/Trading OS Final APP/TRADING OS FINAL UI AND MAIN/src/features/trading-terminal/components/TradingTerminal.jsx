import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import {
  TrendingUp, TrendingDown, Activity, Globe, Calendar,
  Newspaper, Target, AlertTriangle,
  RefreshCw, Sparkles, Wifi, WifiOff, Bell, BellRing,
  LayoutGrid, Pencil, Settings, PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, ChevronDown, ChevronUp,
  BarChart3, BookOpen, X
} from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import TradingChart from './TradingChart';
import MacroPanel from './MacroPanel';
import LevelsPanel from './LevelsPanel';
import NewsPanel from './NewsPanel';
import CalendarPanel from './CalendarPanel';
import AIDesk from './AIDesk';
import DrawingToolbar from './DrawingToolbar';
import AlertPanel from './AlertPanel';
import MultiChartView from './MultiChartView';
import SmartMoneyOverlay, { DEFAULT_INDICATOR_COLORS } from './SmartMoneyOverlay';
import ExecutionBridge from './ExecutionBridge';
import KeyLevelsCards from './KeyLevelsCards';
import ChartSettings, { DEFAULT_COLORS } from './ChartSettings';
import OrderBook from './OrderBook';
import { getTradingTerminalApiUrl, getTradingTerminalWsUrl } from '../env';
import { getTradingAdapter } from '@/lib/tradingAdapterSingleton';
import { LiveEngineClient } from '@/lib/realtime/liveEngineClient';
import { ChartFetchError } from '@/engine/types/chart';

const CATEGORIES = ['forex', 'metals', 'indices', 'stocks'];

const ENGINE_PAIRS = {
  forex: [
    { symbol: 'EURUSD', name: 'EUR/USD' },
    { symbol: 'GBPUSD', name: 'GBP/USD' },
    { symbol: 'USDJPY', name: 'USD/JPY' },
  ],
  metals: [{ symbol: 'XAUUSD', name: 'XAU/USD' }],
  indices: [
    { symbol: 'SPX500', name: 'SPX500' },
    { symbol: 'NAS100', name: 'NAS100' },
  ],
  stocks: [
    { symbol: 'BTCUSD', name: 'BTC/USD' },
    { symbol: 'AAPL', name: 'AAPL' },
    { symbol: 'MSFT', name: 'MSFT' },
    { symbol: 'NVDA', name: 'NVDA' },
    { symbol: 'TSLA', name: 'TSLA' },
  ],
};

function pickInitialEnginePair(externalSym) {
  const flat = [
    ...ENGINE_PAIRS.forex,
    ...ENGINE_PAIRS.metals,
    ...ENGINE_PAIRS.indices,
    ...ENGINE_PAIRS.stocks,
  ];
  const ext = String(externalSym || '').trim();
  if (ext) {
    const found = flat.find((p) => p.symbol === ext);
    if (found) return found;
  }
  return ENGINE_PAIRS.metals?.[0] || ENGINE_PAIRS.forex?.[0];
}

function applyBarUpdateToBars(bars, bar) {
  if (!bar) return bars;
  const nextBar = {
    date: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume ?? 0,
  };
  if (!Array.isArray(bars) || bars.length === 0) return [nextBar];
  const last = bars[bars.length - 1];
  if (last?.date === nextBar.date) {
    const out = bars.slice();
    out[out.length - 1] = { ...last, ...nextBar };
    return out;
  }
  if (new Date(nextBar.date).getTime() > new Date(last?.date).getTime()) {
    // Critical invariant: a new candle must open at the previous candle close.
    // This prevents "vertical fake candles" when live OHLC is derived from ticks
    // and could otherwise start with open=tickPrice.
    const prevClose = Number(last?.close);
    const open = Number.isFinite(prevClose) ? prevClose : nextBar.open;
    const high = Math.max(open, nextBar.high, nextBar.close);
    const low = Math.min(open, nextBar.low, nextBar.close);
    return [...bars, { ...nextBar, open, high, low }];
  }
  return bars;
}

function toEngineSymbol(sym) {
  const s = String(sym || '').trim();
  if (!s) return s;
  if (s.includes('/')) return s;
  // FX like EURUSD → EUR/USD
  if (/^[A-Z]{6}$/.test(s)) return `${s.slice(0, 3)}/${s.slice(3)}`;
  // Crypto like BTCUSD → BTC/USD
  if (/^[A-Z]{3,5}USD$/.test(s)) return `${s.replace(/USD$/, '')}/USD`;
  return s;
}

function toEngineTimeframe(tf) {
  const m = {
    '1min': '1M',
    '5min': '5M',
    '15min': '15M',
    '1hour': '1H',
    '4hour': '4H',
    '1day': '1D',
    '1week': '1W',
    '1month': '1MO',
  };
  return m[String(tf)] || '1D';
}

/**
 * TradingTerminal — Chart Workspace Shell
 * 
 * Integration props for Trading OS:
 * @param {string} externalSymbol — Override active symbol from parent app
 * @param {string} externalTimeframe — Override active timeframe from parent app
 * @param {function} onSymbolChange — Callback when user changes symbol (for parent sync)
 * @param {function} onTimeframeChange — Callback when user changes timeframe (for parent sync)
 * @param {string} apiBaseUrl — Override API base URL (default: VITE_TRADING_TERMINAL_API_URL)
 * @param {React.ReactNode} watchlistSlot — Replace watchlist bar content
 * @param {React.ReactNode} axeSlot — Replace AXE/AI Desk panel content
 * @param {object} initialPanelState — {left: bool, right: bool, execution: bool}
 */
const TradingTerminal = ({
  externalSymbol,
  externalTimeframe,
  onSymbolChange: onSymbolChangeProp,
  onTimeframeChange: onTimeframeChangeProp,
  apiBaseUrl,
  watchlistSlot,
  axeSlot,
  initialPanelState,
} = {}) => {
  const API = getTradingTerminalApiUrl(apiBaseUrl);
  const WS_URL = getTradingTerminalWsUrl(apiBaseUrl);
  const ENGINE_MODE = import.meta.env.VITE_USE_ENGINE_EDGE === 'true' && !API;
  /** Same chart path as Engine Ops live proof: `getTradingAdapter().getChart` via engine-proxy when Edge is on. */
  const EDGE_DATA = import.meta.env.VITE_USE_ENGINE_EDGE === 'true';
  const LIVE_ENGINE_WS_URL = import.meta.env.VITE_LIVE_ENGINE_WS_URL;

  const [activeCategory, setActiveCategory] = useState('forex');
  const [activePair, setActivePair] = useState(null);
  const [activeTimeframe, setActiveTimeframe] = useState(externalTimeframe || '1day');
  const [pairs, setPairs] = useState({});
  const [quote, setQuote] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [keyLevels, setKeyLevels] = useState([]);
  const [news, setNews] = useState([]);
  const [macroData, setMacroData] = useState([]);
  const [calendarData, setCalendarData] = useState([]);
  const [tickerPrices, setTickerPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const liveEngineRef = useRef(null);

  // UI states
  const [drawingTool, setDrawingTool] = useState('cursor');
  const [drawingColor, setDrawingColor] = useState('#3B82F6');
  const [drawings, setDrawings] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const [showMultiChart, setShowMultiChart] = useState(false);
  const [showDrawingTools, setShowDrawingTools] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(initialPanelState?.left ?? true);
  const [rightPanelOpen, setRightPanelOpen] = useState(initialPanelState?.right ?? true);
  const [executionOpen, setExecutionOpen] = useState(initialPanelState?.execution ?? false);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);

  // SMC overlay toggles
  const [overlaySettings, setOverlaySettings] = useState({
    bos_choch: false, order_blocks: false, fvg: false, ifvg: false,
    liquidity: false, support_resistance: false, pdhl: false, pwhl: false, pmhl: false, pqhl: false,
    ema20: false, ema50: false, ema200: false, vwap: false, volume: true,
    swing_structure: true, auto_fib: true,
  });
  const [showSMCOverlay, setShowSMCOverlay] = useState(false);
  const [obLimit, setObLimit] = useState(1);
  const [fvgLimit, setFvgLimit] = useState(1);
  const [drawingHistory, setDrawingHistory] = useState([]);
  const [drawingHistoryIndex, setDrawingHistoryIndex] = useState(-1);
  const [htfTimeframe, setHtfTimeframe] = useState('1day');
  const [chartColors, setChartColors] = useState(DEFAULT_COLORS);
  const [showChartSettings, setShowChartSettings] = useState(false);
  const [indicatorColors, setIndicatorColors] = useState(DEFAULT_INDICATOR_COLORS);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const terminalRef = useRef(null);

  // Mobile detection — width-based + touch device fallback
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState('chart');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', () => setTimeout(check, 100));
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  const allPairsFlat = useMemo(() => Object.values(pairs).flat(), [pairs]);

  // ============ External symbol/timeframe sync (Trading OS integration) ============
  useEffect(() => {
    if (externalSymbol && allPairsFlat.length > 0) {
      const pair = allPairsFlat.find(p => p.symbol === externalSymbol);
      if (pair && pair.symbol !== activePair?.symbol) {
        for (const [cat, list] of Object.entries(pairs)) {
          if (list.some(p => p.symbol === pair.symbol)) { setActiveCategory(cat); break; }
        }
        switchPair(pair);
      }
    }
  }, [externalSymbol, allPairsFlat]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (externalTimeframe && externalTimeframe !== activeTimeframe) {
      setActiveTimeframe(externalTimeframe);
    }
  }, [externalTimeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============ Click outside to close overlays ============
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showSMCOverlay && !e.target.closest('[data-testid="smc-overlay-panel"]') && !e.target.closest('[data-testid="toggle-smc-overlay"]')) {
        setShowSMCOverlay(false);
      }
      if (showChartSettings && !e.target.closest('[data-panel="chart-settings"]') && !e.target.closest('[data-testid="toggle-chart-settings"]')) {
        setShowChartSettings(false);
      }
      if (showAlerts && !e.target.closest('[data-panel="alerts"]') && !e.target.closest('[data-testid="toggle-alerts"]')) {
        setShowAlerts(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSMCOverlay, showChartSettings, showAlerts]);

  // ============ WebSocket ============
  const connectWebSocket = useCallback((symbol) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (!symbol || !WS_URL) return;
    try {
      const ws = new WebSocket(`${WS_URL}/api/ws/prices/${symbol}`);
      ws.onopen = () => { setWsConnected(true); if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; } };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'quote') { setQuote(prev => ({ ...prev, ...data })); }
          else if (data.type === 'alert_triggered') {
            setTriggeredAlerts(prev => [data, ...prev]);
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`Alert: ${data.label}`, { body: `${data.symbol} hit ${data.target_price}`, icon: '/favicon.ico' });
            }
            try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 800; osc.connect(ctx.destination); osc.start(); setTimeout(() => osc.stop(), 200); } catch(e) {}
          }
        } catch (err) {}
      };
      ws.onclose = () => { setWsConnected(false); reconnectTimerRef.current = setTimeout(() => connectWebSocket(symbol), 5000); };
      ws.onerror = () => { setWsConnected(false); };
      wsRef.current = ws;
    } catch (err) {}
  }, [WS_URL]);

  // ============ Live chart WebSocket (Cloudflare / worker) ============
  // Architecture: HTTP `getTradingAdapter().getChart` loads full history; WS streams only deltas.
  // Never replace full history over WS — only `bar_update` (OHLC patch) and `tick` (last candle close/HL).
  useEffect(() => {
    if (!EDGE_DATA) return;
    if (!LIVE_ENGINE_WS_URL) return;
    if (!activePair?.symbol) return;

    const client = liveEngineRef.current ?? new LiveEngineClient({ url: LIVE_ENGINE_WS_URL, uiThrottleMs: 80 });
    liveEngineRef.current = client;

    const symbol = toEngineSymbol(activePair.symbol);
    const timeframe = toEngineTimeframe(activeTimeframe);

    const unsub = client.onMessage((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (import.meta.env.DEV && (msg.type === 'provider_status' || msg.type === 'heartbeat')) {
        console.debug('[live-engine]', msg);
      }
      if (msg.type === 'bar_update') {
        if (msg.symbol !== symbol || msg.timeframe !== timeframe) return;
        setChartData((prev) => {
          const bars = applyBarUpdateToBars(prev?.bars || [], msg.bar);
          return { ...(prev || {}), bars, timeframe: prev?.timeframe || activeTimeframe };
        });
        return;
      }
      if (msg.type === 'tick' && msg.symbol === symbol) {
        const price = Number(msg.price);
        if (!Number.isFinite(price)) return;
        // Intraday candle correctness comes from `bar_update` (Worker-built buckets).
        // tick only updates the displayed last price.
        setQuote((prev) =>
          prev && typeof prev === 'object'
            ? { ...prev, price, timestamp: msg.ts || new Date().toISOString() }
            : prev,
        );
      }
    });

    client.subscribe(symbol, timeframe);
    return () => {
      unsub();
      client.unsubscribe(symbol, timeframe);
    };
  }, [EDGE_DATA, LIVE_ENGINE_WS_URL, activePair?.symbol, activeTimeframe]);

  // ============ Data Fetchers ============
  const fetchPairs = useCallback(async () => {
    if (ENGINE_MODE) {
      setError(null);
      setPairs(ENGINE_PAIRS);
      const initial = pickInitialEnginePair(externalSymbol);
      if (initial) {
        for (const [cat, list] of Object.entries(ENGINE_PAIRS)) {
          if (list.some((p) => p.symbol === initial.symbol)) {
            setActiveCategory(cat);
            break;
          }
        }
        setActivePair(initial);
      }
      return;
    }
    if (!API) {
      setPairs({});
      setError('Chart API not configured — set VITE_TRADING_TERMINAL_API_URL');
      return;
    }
    try { const r = await axios.get(`${API}/pairs`); setPairs(r.data); if (r.data['forex']?.length > 0) setActivePair(r.data['forex'][0]); } catch (err) { setError('Failed to load trading pairs'); }
  }, [API, ENGINE_MODE, externalSymbol]);
  const fetchQuote = useCallback(async (symbol) => {
    if (EDGE_DATA) return; // quote comes from last candles when chart uses engine-proxy
    if (ENGINE_MODE) return; // derived from candles in engine mode
    if (!API) return;
    try { const r = await axios.get(`${API}/market/quote/${symbol}`); setQuote(r.data); } catch (err) {}
  }, [API, ENGINE_MODE, EDGE_DATA]);
  const fetchChartData = useCallback(async (symbol, timeframe) => {
    if (EDGE_DATA) {
      try {
        setError(null);
        const adapter = getTradingAdapter();
        const engineSym = toEngineSymbol(symbol);
        const engineTf = toEngineTimeframe(timeframe);
        if (import.meta.env.DEV) {
          console.debug('[chart-engine]', { terminalPair: symbol, engineSym, engineTf, edge: true });
        }
        const r = await adapter.getChart(engineSym, engineTf, timeframe === '1day' ? 220 : 180);
        const candles = Array.isArray(r?.candles) ? r.candles : [];
        if (candles.length === 0) {
          setChartData((prev) => ({ ...(prev || {}), bars: [], indicators: {}, timeframe }));
          setError(
            `Chart unavailable (degraded) — ${engineSym} / ${engineTf}: empty series. No provider returned candles for this pair or timeframe. Check Engine Ops getChart proof rows.`,
          );
          return;
        }
        const bars = candles.map((c) => ({
          date: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume ?? 0,
        }));
        setChartData({ bars, indicators: r?.indicators || {}, timeframe });

        // lightweight quote derived from last 2 candles
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        if (last) {
          const price = Number(last.close ?? 0);
          const prevClose = Number(prev?.close ?? price);
          const change = price - prevClose;
          const changePercent = prevClose ? (change / prevClose) * 100 : 0;
          setQuote({
            symbol,
            price,
            change,
            change_percent: changePercent,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const provErr =
          e instanceof ChartFetchError && e.debug?.providerErrors
            ? ` Provider errors: ${JSON.stringify(e.debug.providerErrors)}.`
            : '';
        const cfg =
          e instanceof ChartFetchError && e.debug?.configured
            ? ` Keys configured: polygon=${e.debug.configured.polygon} twelvedata=${e.debug.configured.twelvedata} fmp=${e.debug.configured.fmp}; Yahoo only if ENABLE_YAHOO_CHART_FALLBACK=true.`
            : '';
        if (import.meta.env.DEV && e instanceof ChartFetchError) console.warn('[chart-engine] fetch failed', e.debug);
        const head =
          e instanceof ChartFetchError
            ? `Chart unavailable (degraded) — ${engineSym} / ${engineTf}. No live provider returned data for this pair or timeframe.`
            : `Chart request failed — ${engineSym} / ${engineTf}.`;
        setError(`${head}${cfg}${e instanceof ChartFetchError ? '' : ` ${msg}`}${provErr}`);
      }
      return;
    }
    if (!API) return;
    try {
      const count = timeframe === '1day' ? 200 : 150;
      const r = await axios.get(`${API}/market/chart/${symbol}?timeframe=${timeframe}&count=${count}&ob_limit=${obLimit}&fvg_limit=${fvgLimit}`);
      setChartData(r.data);
    } catch (err) {
      try { const r = await axios.get(`${API}/market/historical/${symbol}?days=100&timeframe=${timeframe}`); setChartData({ bars: r.data, indicators: {}, timeframe }); } catch (err2) {}
    }
  }, [API, ENGINE_MODE, EDGE_DATA, obLimit, fvgLimit]);
  const fetchLevels = useCallback(async (symbol, tf) => { if (!API) return; try { const r = await axios.get(`${API}/market/htf-levels/${symbol}?timeframe=${tf || '1day'}`); setKeyLevels(r.data); } catch (err) {} }, [API]);
  const fetchNews = useCallback(async (symbol) => {
    if (ENGINE_MODE) {
      try {
        const adapter = getTradingAdapter();
        const engineSym = toEngineSymbol(symbol);
        const items = await adapter.news(engineSym, { limit: 10 });
        setNews(Array.isArray(items) ? items : []);
      } catch {
        setNews([]);
      }
      return;
    }
    if (!API) return;
    try { const r = await axios.get(`${API}/market/news/${symbol}?limit=10`); setNews(r.data); } catch (err) {}
  }, [API, ENGINE_MODE]);
  const fetchMacro = useCallback(async () => {
    if (ENGINE_MODE) {
      // Keep existing UI intact: show a small stable set of macro keys.
      const keys = ['FEDFUNDS', 'DGS10', 'CPIAUCSL', 'UNRATE', 'DCOILWTICO'];
      try {
        const adapter = getTradingAdapter();
        const series = await Promise.all(keys.map((k) => adapter.macroSeries(k, '5Y').catch(() => null)));
        const out = series.filter(Boolean);
        setMacroData(out);
      } catch {
        setMacroData([]);
      }
      return;
    }
    if (!API) return;
    try { const r = await axios.get(`${API}/macro/indicators`); setMacroData(r.data); } catch (err) {}
  }, [API, ENGINE_MODE]);
  const fetchCalendar = useCallback(async () => { if (!API) return; try { const r = await axios.get(`${API}/macro/calendar`); setCalendarData(r.data); } catch (err) {} }, [API]);
  const fetchTicker = useCallback(async () => { if (!API) return; try { const r = await axios.get(`${API}/ticker/prices`); setTickerPrices(r.data); } catch (err) {} }, [API]);
  const fetchDrawings = useCallback(async (symbol, timeframe) => { if (!API) return; try { const r = await axios.get(`${API}/drawings/${symbol}?timeframe=${timeframe}`); setDrawings(r.data); } catch (err) {} }, [API]);
  const fetchAlertCount = useCallback(async (symbol) => {
    if (!API) {
      setAlertCount(0);
      return;
    }
    try {
      const r = await axios.get(`${API}/alerts?symbol=${symbol}`);
      setAlertCount(r.data.length);
    } catch {
      setAlertCount(0);
    }
  }, [API]);

  // ============ Drawing handlers ============
  const handleDrawingToolChange = useCallback((toolId, color) => { setDrawingTool(toolId); if (color) setDrawingColor(color); }, []);
  const handleDrawingCreated = useCallback(async (drawing) => {
    if (!activePair?.symbol || !API) return;
    try {
      const res = await axios.post(`${API}/drawings`, { symbol: activePair.symbol, tool: drawing.tool, points: drawing.points, color: drawing.color, timeframe: activeTimeframe, text: drawing.text });
      setDrawingHistory(prev => [...prev.slice(0, drawingHistoryIndex + 1), res.data]);
      setDrawingHistoryIndex(prev => prev + 1);
      await fetchDrawings(activePair.symbol, activeTimeframe);
      // Auto-switch to cursor for immediate dragging
      setDrawingTool('cursor');
      setSelectedDrawingId(res.data.id);
    } catch (err) {}
  }, [API, activePair, activeTimeframe, fetchDrawings, drawingHistoryIndex]);
  const handleDrawingUpdate = useCallback(async (drawingId, updates) => {
    if (!API) return;
    try {
      await axios.patch(`${API}/drawings/${drawingId}`, updates);
      if (activePair?.symbol) fetchDrawings(activePair.symbol, activeTimeframe);
    } catch (err) {}
  }, [API, activePair, activeTimeframe, fetchDrawings]);
  const handleDrawingColorChange = useCallback(async (drawingId, color) => {
    if (!API) return;
    try {
      await axios.patch(`${API}/drawings/${drawingId}`, { color });
      if (activePair?.symbol) fetchDrawings(activePair.symbol, activeTimeframe);
    } catch (err) {}
  }, [API, activePair, activeTimeframe, fetchDrawings]);
  const handleDrawingLockToggle = useCallback(async (drawingId, locked) => {
    if (!API) return;
    try {
      await axios.patch(`${API}/drawings/${drawingId}`, { locked });
      if (activePair?.symbol) fetchDrawings(activePair.symbol, activeTimeframe);
    } catch (err) {}
  }, [API, activePair, activeTimeframe, fetchDrawings]);
  const handleDeleteSelected = useCallback(async (drawingId) => {
    if (!API) return;
    try {
      await axios.delete(`${API}/drawings/${drawingId}`);
      if (activePair?.symbol) fetchDrawings(activePair.symbol, activeTimeframe);
    } catch (err) {}
  }, [API, activePair, activeTimeframe, fetchDrawings]);
  const handleUndoDrawing = useCallback(async () => {
    if (!API) return;
    if (drawingHistory.length === 0 || drawingHistoryIndex < 0) return;
    const last = drawingHistory[drawingHistoryIndex];
    if (last?.id) { try { await axios.delete(`${API}/drawings/${last.id}`); } catch(e) {} }
    setDrawingHistoryIndex(prev => prev - 1);
    if (activePair?.symbol) fetchDrawings(activePair.symbol, activeTimeframe);
  }, [API, drawingHistory, drawingHistoryIndex, activePair, activeTimeframe, fetchDrawings]);
  const handleClearDrawings = useCallback(async () => {
    if (!activePair?.symbol || !API) return;
    try { await axios.delete(`${API}/drawings/symbol/${activePair.symbol}?timeframe=${activeTimeframe}`); setDrawings([]); } catch (err) {}
  }, [API, activePair, activeTimeframe]);

  // ============ Pair switching — clear stale data ============
  const switchPair = useCallback((pair) => {
    if (pair.symbol === activePair?.symbol) return;
    setQuote(null);
    setChartData(null);
    setActivePair(pair);
    onSymbolChangeProp?.(pair.symbol);
  }, [activePair, onSymbolChangeProp]);

  // ============ Effects ============
  useEffect(() => {
    const init = async () => { setLoading(true); await fetchPairs(); setLoading(false); fetchMacro(); fetchCalendar(); fetchTicker(); };
    init();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    return () => { if (wsRef.current) wsRef.current.close(); if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); };
  }, [fetchPairs, fetchMacro, fetchCalendar, fetchTicker]);

  useEffect(() => {
    const list = pairs[activeCategory];
    if (!list?.length) return;
    if (activePair && list.some((p) => p.symbol === activePair.symbol)) return;
    switchPair(list[0]);
  }, [activeCategory, pairs, activePair, switchPair]);

  useEffect(() => {
    if (!activePair?.symbol) return;
    const sym = activePair.symbol;
    Promise.all([fetchQuote(sym), fetchChartData(sym, activeTimeframe), fetchLevels(sym, htfTimeframe), fetchNews(sym), fetchDrawings(sym, activeTimeframe), fetchAlertCount(sym)]);
    connectWebSocket(sym);
  }, [activePair, fetchQuote, fetchChartData, fetchLevels, fetchNews, connectWebSocket, activeTimeframe, fetchDrawings, fetchAlertCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTimeframeChange = useCallback(async (tf) => {
    setActiveTimeframe(tf);
    onTimeframeChangeProp?.(tf);
    if (activePair?.symbol) { await fetchChartData(activePair.symbol, tf); await fetchDrawings(activePair.symbol, tf); }
  }, [activePair, fetchChartData, fetchDrawings, onTimeframeChangeProp]);

  useEffect(() => { if (activePair?.symbol) fetchChartData(activePair.symbol, activeTimeframe); }, [obLimit, fvgLimit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activePair?.symbol) fetchLevels(activePair.symbol, htfTimeframe); }, [htfTimeframe]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const i = setInterval(fetchTicker, 30000); return () => clearInterval(i); }, [fetchTicker]);

  const handleRefresh = async () => {
    if (!activePair?.symbol) return;
    await Promise.all([fetchQuote(activePair.symbol), fetchChartData(activePair.symbol, activeTimeframe), fetchLevels(activePair.symbol, htfTimeframe), fetchNews(activePair.symbol), fetchMacro(), fetchCalendar()]);
  };

  const handleMultiChartClose = useCallback((expandedConfig) => {
    setShowMultiChart(false);
    if (expandedConfig) {
      const pair = allPairsFlat.find(p => p.symbol === expandedConfig.symbol);
      if (pair) {
        for (const [cat, list] of Object.entries(pairs)) { if (list.some(p => p.symbol === expandedConfig.symbol)) { setActiveCategory(cat); break; } }
        switchPair(pair);
        setActiveTimeframe(expandedConfig.timeframe);
      }
    }
  }, [pairs, allPairsFlat, switchPair]);

  // Multi-chart active chart change — sync tiles
  const [multiChartActiveConfig, setMultiChartActiveConfig] = useState(null);
  const handleMultiChartActiveChange = useCallback((config) => {
    setMultiChartActiveConfig(config);
  }, []);

  // Use multi-chart active timeframe for tiles when multi-chart is open
  const tilesTimeframe = showMultiChart && multiChartActiveConfig ? multiChartActiveConfig.timeframe : activeTimeframe;
  const tilesSymbol = showMultiChart && multiChartActiveConfig ? multiChartActiveConfig.symbol : activePair?.symbol;

  const dec = (sym) => {
    if (!sym) return 2;
    if (['XAUUSD','XAGUSD','XPTUSD'].some(m => sym.includes(m))) return 2;
    if (sym.length === 6 && sym.includes('USD')) return 4;
    return 2;
  };

  if (error) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-[#FF3B30] mx-auto mb-4" />
          <p className="text-white text-lg">{error}</p>
          <Button onClick={() => window.location.reload()} className="mt-4" data-testid="retry-button">Retry</Button>
        </div>
      </div>
    );
  }

  // =====================================================
  // MOBILE LAYOUT — only rendered when screen < 768px
  // Desktop layout below remains completely untouched
  // =====================================================
  if (isMobile) {
    const MOBILE_TABS = [
      { id: 'chart', icon: BarChart3, label: 'Chart' },
      { id: 'macro', icon: Globe, label: 'Macro' },
      { id: 'news', icon: Newspaper, label: 'News' },
      { id: 'book', icon: BookOpen, label: 'Book' },
      { id: 'levels', icon: Target, label: 'Levels' },
      { id: 'ai', icon: Sparkles, label: 'AI' },
    ];

    return (
      <div ref={terminalRef} className="h-[100dvh] w-full flex flex-col relative overflow-hidden" style={{background: '#000'}} data-testid="trading-terminal">
        {/* Mobile Header */}
        <div className="flex-shrink-0 px-2 py-1.5 flex items-center justify-between border-b border-white/[0.06] bg-[#050505] z-20" data-testid="terminal-header">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="w-3.5 h-3.5 text-[#06b6d4] flex-shrink-0" />
            <select
              value={activePair?.symbol || ''}
              onChange={e => {
                const p = allPairsFlat.find(pp => pp.symbol === e.target.value);
                if (p) {
                  for (const [cat, list] of Object.entries(pairs)) { if (list.some(pp => pp.symbol === p.symbol)) { setActiveCategory(cat); break; } }
                  switchPair(p);
                }
              }}
              className="bg-transparent text-xs font-bold text-[#06b6d4] border-0 focus:outline-none min-w-0 max-w-[100px]"
              data-testid="mobile-pair-select"
            >
              {CATEGORIES.map(cat => (
                <optgroup key={cat} label={cat.toUpperCase()}>
                  {(pairs[cat] || []).map(p => <option key={p.symbol} value={p.symbol} className="bg-[#111] text-white">{p.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {quote && (
              <>
                <span className="font-mono text-sm text-white font-bold">{quote.price?.toFixed(dec(activePair?.symbol))}</span>
                <span className={`text-[10px] font-mono ${quote.change_percent >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                  {quote.change_percent >= 0 ? '+' : ''}{quote.change_percent?.toFixed(2)}%
                </span>
              </>
            )}
            {wsConnected ? <Wifi className="w-2.5 h-2.5 text-[#22c55e]" /> : <WifiOff className="w-2.5 h-2.5 text-white/15" />}
          </div>
        </div>

        {/* Mobile Body */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {mobileTab === 'chart' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-shrink-0 px-2 py-1 flex items-center justify-between border-b border-white/[0.04] bg-[#050505]">
                <div className="flex items-center gap-1">
                  <button onClick={() => { setShowDrawingTools(!showDrawingTools); if (showDrawingTools) setDrawingTool('cursor'); }} className={`p-1.5 rounded ${showDrawingTools ? 'text-[#06b6d4] bg-[#06b6d4]/10' : 'text-white/25'}`} data-testid="toggle-drawing-tools">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setShowSMCOverlay(!showSMCOverlay)} className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${showSMCOverlay ? 'text-[#06b6d4] bg-[#06b6d4]/10' : 'text-white/25'}`} data-testid="toggle-smc-overlay">SMC</button>
                  <button onClick={() => setShowChartSettings(!showChartSettings)} className={`p-1.5 rounded ${showChartSettings ? 'text-[#06b6d4] bg-[#06b6d4]/10' : 'text-white/25'}`} data-testid="toggle-chart-settings">
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setShowAlerts(!showAlerts)} className={`p-1.5 rounded relative ${triggeredAlerts.length > 0 ? 'text-[#F59E0B]' : 'text-white/25'}`} data-testid="toggle-alerts">
                    <Bell className="w-3.5 h-3.5" />
                    {alertCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#F59E0B] text-[6px] text-black flex items-center justify-center">{alertCount}</span>}
                  </button>
                </div>
                <span className="text-[9px] font-mono text-white/15">{chartData?.bars?.length || 0} bars</span>
              </div>

              {showSMCOverlay && (
                <div className="fixed inset-0 z-50 bg-black/90 overflow-auto" onClick={e => { if (e.target === e.currentTarget) setShowSMCOverlay(false); }}>
                  <div className="mt-12 mx-2 mb-4">
                    <SmartMoneyOverlay isOpen={true} onClose={() => setShowSMCOverlay(false)} overlaySettings={overlaySettings} onSettingsChange={setOverlaySettings} obLimit={obLimit} fvgLimit={fvgLimit} onObLimitChange={setObLimit} onFvgLimitChange={setFvgLimit} indicatorColors={indicatorColors} onIndicatorColorsChange={setIndicatorColors} />
                  </div>
                </div>
              )}
              {showChartSettings && (
                <div className="fixed inset-0 z-50 bg-black/90 overflow-auto" onClick={e => { if (e.target === e.currentTarget) setShowChartSettings(false); }}>
                  <div className="mt-12 mx-2 mb-4">
                    <ChartSettings isOpen={true} onClose={() => setShowChartSettings(false)} chartColors={chartColors} onColorsChange={setChartColors} />
                  </div>
                </div>
              )}
              {showAlerts && (
                <div className="fixed inset-0 z-50 bg-black/90 overflow-auto" onClick={e => { if (e.target === e.currentTarget) setShowAlerts(false); }}>
                  <div className="mt-12 mx-2 mb-4">
                    <AlertPanel symbol={activePair?.symbol} currentPrice={quote?.price} isOpen={true} onClose={() => setShowAlerts(false)} triggeredAlerts={triggeredAlerts} setTriggeredAlerts={setTriggeredAlerts} />
                  </div>
                </div>
              )}

              {showDrawingTools && (
                <div className="flex-shrink-0 border-b border-white/[0.04] overflow-x-auto">
                  <DrawingToolbar activeTool={drawingTool} onToolChange={handleDrawingToolChange} onClear={handleClearDrawings} drawingCount={drawings.length} selectedDrawing={drawings.find(d => d.id === selectedDrawingId)} onColorChange={handleDrawingColorChange} onLockToggle={handleDrawingLockToggle} onDeleteSelected={handleDeleteSelected} onDrawingUpdate={handleDrawingUpdate} />
                </div>
              )}

              <div className="flex-1 min-h-0">
                {loading && !chartData ? (
                  <Skeleton className="w-full h-full bg-white/[0.02]" />
                ) : (
                  <TradingChart
                    data={chartData?.bars || []} levels={keyLevels} symbol={activePair?.symbol}
                    indicators={chartData?.indicators} activeTimeframe={activeTimeframe}
                    onTimeframeChange={handleTimeframeChange} drawingTool={drawingTool} drawingColor={drawingColor}
                    drawings={drawings} onDrawingCreated={handleDrawingCreated} onDrawingUpdate={handleDrawingUpdate}
                    onDrawingSelect={setSelectedDrawingId} overlaySettings={overlaySettings}
                    chartColors={chartColors} indicatorColors={indicatorColors}
                  />
                )}
              </div>

              <div className="flex-shrink-0 border-t border-white/[0.04] bg-[#030303]">
                <button onClick={() => setExecutionOpen(!executionOpen)} className="w-full flex items-center justify-between px-3 py-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Trade</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-[#D32F2F] font-bold">SELL</span>
                    <span className="text-white/10">|</span>
                    <span className="text-[9px] font-mono text-[#1976D2] font-bold">BUY</span>
                    {executionOpen ? <ChevronDown className="w-3 h-3 text-white/20" /> : <ChevronUp className="w-3 h-3 text-white/20" />}
                  </div>
                </button>
                {executionOpen && <ExecutionBridge symbol={activePair?.symbol} quote={quote} />}
              </div>
            </div>
          )}

          {mobileTab === 'macro' && <ScrollArea className="flex-1"><MacroPanel data={macroData} loading={loading} /></ScrollArea>}
          {mobileTab === 'news' && <ScrollArea className="flex-1"><NewsPanel news={news} symbol={activePair?.symbol} loading={loading} /></ScrollArea>}
          {mobileTab === 'book' && <div className="flex-1 min-h-0"><OrderBook quote={quote} symbol={activePair?.symbol} /></div>}
          {mobileTab === 'levels' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-shrink-0 px-3 py-1.5 flex items-center justify-between border-b border-white/[0.04]">
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Key Levels</span>
                <div className="flex items-center gap-0.5">
                  {['1hour','4hour','1day'].map(tf => (
                    <button key={tf} onClick={() => setHtfTimeframe(tf)} className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${htfTimeframe === tf ? 'bg-white/10 text-white' : 'text-white/25'}`}>{tf === '1hour' ? 'H1' : tf === '4hour' ? 'H4' : 'D1'}</button>
                  ))}
                </div>
              </div>
              <ScrollArea className="flex-1"><LevelsPanel levels={keyLevels} currentPrice={quote?.price} loading={loading} /></ScrollArea>
            </div>
          )}
          {mobileTab === 'ai' && <div className="flex-1 min-h-0"><AIDesk symbol={activePair?.symbol} quote={quote} levels={keyLevels} news={news} /></div>}
        </div>

        {/* Mobile Tab Bar */}
        <div className="flex-shrink-0 border-t border-white/[0.06] bg-[#050505] flex items-center justify-around px-1 pb-2" style={{paddingBottom: 'max(env(safe-area-inset-bottom, 8px), 8px)'}} data-testid="mobile-tab-bar">
          {MOBILE_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setMobileTab(tab.id)}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-all ${mobileTab === tab.id ? 'text-[#06b6d4]' : 'text-white/25'}`}
                data-testid={`mobile-tab-${tab.id}`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[7px] font-bold uppercase tracking-wider">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <MultiChartView isOpen={showMultiChart} onClose={handleMultiChartClose} allPairs={allPairsFlat} onActiveChartChange={handleMultiChartActiveChange} />
      </div>
    );
  }

  // =====================================================
  // DESKTOP LAYOUT
  // =====================================================

  return (
    <div ref={terminalRef} className="h-screen w-full flex flex-col relative overflow-hidden" style={{background: '#000'}} data-testid="trading-terminal">
      {/* Row 1: Watchlist — replaceable via watchlistSlot prop */}
      <div className="h-7 border-b border-white/[0.04] flex items-center px-3 bg-[#030303]" data-testid="watchlist-bar">
        {watchlistSlot || (
          <>
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">Watchlist</span>
            <div className="flex-1" />
            <span className="text-[8px] font-mono text-white/10">slot:watchlist</span>
          </>
        )}
      </div>

      {/* Row 2: Symbol + Price + Sentiment + LIVE + Refresh */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-white/[0.04] bg-[#050505]" data-testid="terminal-header">
        <div className="flex items-center gap-3">
          {/* Symbol name */}
          <span className="font-mono text-xs font-bold text-[#06b6d4]" data-testid="active-symbol-name">{activePair?.name || '—'}</span>
          {/* Price */}
          {quote && (
            <>
              <span className="font-mono text-base font-bold text-white">{quote.price?.toFixed(dec(activePair?.symbol))}</span>
              <span className={`text-[10px] font-mono ${quote.change_percent >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                {quote.change_percent >= 0 ? '+' : ''}{quote.change_percent?.toFixed(2)}%
              </span>
              {/* Sentiment badge */}
              {(() => {
                const s = quote.change_percent > 0.5 ? 'Bullish' : quote.change_percent < -0.5 ? 'Bearish' : 'Neutral';
                const sc = s === 'Bullish' ? 'bg-[#00E676]/15 text-[#00E676]' : s === 'Bearish' ? 'bg-[#FF3B30]/15 text-[#FF3B30]' : 'bg-white/5 text-white/40';
                return <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${sc}`}>{s === 'Bullish' && <TrendingUp className="w-2.5 h-2.5 inline mr-0.5" />}{s === 'Bearish' && <TrendingDown className="w-2.5 h-2.5 inline mr-0.5" />}{s}</span>;
              })()}
            </>
          )}
          {/* LIVE indicator */}
          <div className="flex items-center gap-0.5" data-testid="ws-status">
            {wsConnected ? <Wifi className="w-2.5 h-2.5 text-[#22c55e]" /> : <WifiOff className="w-2.5 h-2.5 text-white/15" />}
            <span className={`text-[8px] font-mono font-bold ${wsConnected ? 'text-[#22c55e]' : 'text-white/15'}`}>{wsConnected ? 'LIVE' : 'OFF'}</span>
          </div>
          <button onClick={handleRefresh} className="p-0.5 rounded text-white/15 hover:text-white" data-testid="refresh-button" title="Refresh">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        {/* Right: OHLC compact */}
        <div className="flex items-center gap-3 text-[9px] font-mono">
          {quote?.open_price && <span className="text-white/20">O <span className="text-white/50">{quote.open_price?.toFixed(dec(activePair?.symbol))}</span></span>}
          {quote && <span className="text-white/20">H <span className="text-[#22c55e]/70">{quote.day_high?.toFixed(dec(activePair?.symbol))}</span></span>}
          {quote && <span className="text-white/20">L <span className="text-[#ef4444]/70">{quote.day_low?.toFixed(dec(activePair?.symbol))}</span></span>}
          {quote?.volume && <span className="text-white/20">Vol <span className="text-white/50">{(quote.volume / 1000000).toFixed(1)}M</span></span>}
        </div>
      </div>

      {/* Row 3: Main Layout */}
      <div className="flex-1 flex relative z-10 overflow-hidden" data-testid="main-grid">

        {/* LEFT SIDEBAR */}
        {leftPanelOpen && (
          <div className="w-[240px] flex-shrink-0 flex flex-col gap-px border-r border-white/[0.04] bg-[#030303]">
            <div className="flex-1 min-h-0 flex flex-col" data-testid="macro-panel">
              <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-white/[0.04]">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3 h-3 text-[#06b6d4]" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Macro</span>
                </div>
                <button onClick={() => setLeftPanelOpen(false)} className="text-white/15 hover:text-white/50 p-0.5" data-testid="toggle-left-panel" title="Collapse left">
                  <PanelLeftClose className="w-3 h-3" />
                </button>
              </div>
              <ScrollArea className="flex-1"><MacroPanel data={macroData} loading={loading} /></ScrollArea>
            </div>
            <div className="flex-1 min-h-0 flex flex-col border-t border-white/[0.04]" data-testid="news-panel">
              <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-white/[0.04]">
                <div className="flex items-center gap-1.5">
                  <Newspaper className="w-3 h-3 text-[#06b6d4]" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">News</span>
                </div>
                <div className="flex items-center gap-1.5 text-[8px] font-mono">
                  <span className="text-[#22c55e]">{(() => { const b = news?.filter(n => n.sentiment === 'bullish').length || 0; const t = news?.length || 1; return Math.round(b/t*100); })()}%</span>
                  <span className="text-[#ef4444]">{(() => { const b = news?.filter(n => n.sentiment === 'bearish').length || 0; const t = news?.length || 1; return Math.round(b/t*100); })()}%</span>
                </div>
              </div>
              <ScrollArea className="flex-1"><NewsPanel news={news} symbol={activePair?.symbol} loading={loading} /></ScrollArea>
            </div>
            <div className="flex-1 min-h-0 flex flex-col border-t border-white/[0.04]" data-testid="calendar-panel">
              <div className="px-2.5 py-1.5 flex items-center gap-1.5 border-b border-white/[0.04]">
                <Calendar className="w-3 h-3 text-[#22c55e]" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Calendar</span>
              </div>
              <ScrollArea className="flex-1"><CalendarPanel events={calendarData} loading={loading} /></ScrollArea>
            </div>
          </div>
        )}

        {/* CENTER */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Left-collapsed opener */}
          {!leftPanelOpen && (
            <button onClick={() => setLeftPanelOpen(true)} className="absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-[#111] border border-white/10 rounded-r px-0.5 py-3 text-white/20 hover:text-[#06b6d4]" data-testid="toggle-left-panel">
              <PanelLeftOpen className="w-3 h-3" />
            </button>
          )}

          {/* Smart Levels tiles */}
          <div className="flex-shrink-0 border-b border-white/[0.04] bg-[#030303] px-1.5 py-0.5">
            <KeyLevelsCards symbol={tilesSymbol} timeframe={tilesTimeframe} />
          </div>

          {/* Chart toolbar — tools CENTER */}
          <div className="flex-shrink-0 px-2 py-1 border-b border-white/[0.04] flex items-center bg-[#050505]">
            <div className="flex items-center gap-0.5 mx-auto">
              <button onClick={() => { setShowDrawingTools(!showDrawingTools); if (showDrawingTools) setDrawingTool('cursor'); }} className={`p-1 rounded transition-all ${showDrawingTools ? 'text-[#06b6d4] bg-[#06b6d4]/10' : 'text-white/20 hover:text-white/50'}`} data-testid="toggle-drawing-tools" title="Drawing tools"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => setShowSMCOverlay(!showSMCOverlay)} className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${showSMCOverlay ? 'text-[#06b6d4] bg-[#06b6d4]/10' : 'text-white/20 hover:text-white/50'}`} data-testid="toggle-smc-overlay">SMC</button>
              <button onClick={() => setShowChartSettings(!showChartSettings)} className={`p-1 rounded transition-all ${showChartSettings ? 'text-[#06b6d4] bg-[#06b6d4]/10' : 'text-white/20 hover:text-white/50'}`} data-testid="toggle-chart-settings" title="Chart settings"><Settings className="w-3.5 h-3.5" /></button>
              <button onClick={() => setShowMultiChart(true)} className="p-1 rounded text-white/20 hover:text-white/50 transition-all" data-testid="toggle-multi-chart" title="Multi-chart"><LayoutGrid className="w-3.5 h-3.5" /></button>
              <button onClick={() => setShowAlerts(!showAlerts)} className={`p-1 rounded relative transition-all ${triggeredAlerts.length > 0 ? 'text-[#F59E0B]' : showAlerts ? 'text-[#06b6d4] bg-[#06b6d4]/10' : 'text-white/20 hover:text-white/50'}`} data-testid="toggle-alerts" title="Alerts">
                {triggeredAlerts.length > 0 ? <BellRing className="w-3.5 h-3.5 animate-pulse" /> : <Bell className="w-3.5 h-3.5" />}
                {(alertCount > 0 || triggeredAlerts.length > 0) && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#F59E0B] text-[6px] font-bold text-black flex items-center justify-center">{triggeredAlerts.length || alertCount}</span>}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-white/15">{chartData?.bars?.length || 0}</span>
              {drawings.length > 0 && <span className="text-[9px] font-mono text-[#06b6d4]/50">{drawings.length}d</span>}
              {drawingHistory.length > 0 && <button onClick={handleUndoDrawing} className="text-[9px] text-white/20 hover:text-white px-1" data-testid="undo-drawing">Undo</button>}
            </div>
          </div>

          {/* Overlay panels — fixed position so they don't clip */}
          {showSMCOverlay && (
            <div className="fixed inset-0 z-50" onClick={e => { if (e.target === e.currentTarget) setShowSMCOverlay(false); }}>
              <div className="absolute top-24 left-1/2 -translate-x-1/2" data-testid="smc-overlay-panel">
                <SmartMoneyOverlay isOpen={true} onClose={() => setShowSMCOverlay(false)} overlaySettings={overlaySettings} onSettingsChange={setOverlaySettings} obLimit={obLimit} fvgLimit={fvgLimit} onObLimitChange={setObLimit} onFvgLimitChange={setFvgLimit} indicatorColors={indicatorColors} onIndicatorColorsChange={setIndicatorColors} />
              </div>
            </div>
          )}
          {showChartSettings && (
            <div className="fixed inset-0 z-50" onClick={e => { if (e.target === e.currentTarget) setShowChartSettings(false); }}>
              <div className="absolute top-24 left-1/2 -translate-x-1/2" data-panel="chart-settings">
                <ChartSettings isOpen={true} onClose={() => setShowChartSettings(false)} chartColors={chartColors} onColorsChange={setChartColors} />
              </div>
            </div>
          )}
          {showAlerts && (
            <div className="fixed inset-0 z-50" onClick={e => { if (e.target === e.currentTarget) setShowAlerts(false); }}>
              <div className="absolute top-24 right-8" data-panel="alerts">
                <AlertPanel symbol={activePair?.symbol} currentPrice={quote?.price} isOpen={true} onClose={() => setShowAlerts(false)} triggeredAlerts={triggeredAlerts} setTriggeredAlerts={setTriggeredAlerts} />
              </div>
            </div>
          )}

          {/* Chart area */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 relative" data-testid="chart-panel">
            <div className="flex-1 min-h-0 min-w-0 flex">
              {showDrawingTools && (
                <div className="flex-shrink-0 border-r border-white/[0.04]">
                  <DrawingToolbar activeTool={drawingTool} onToolChange={handleDrawingToolChange} onClear={handleClearDrawings} drawingCount={drawings.length} selectedDrawing={drawings.find(d => d.id === selectedDrawingId)} onColorChange={handleDrawingColorChange} onLockToggle={handleDrawingLockToggle} onDeleteSelected={handleDeleteSelected} onDrawingUpdate={handleDrawingUpdate} />
                </div>
              )}
              <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                {loading && !chartData ? (
                  <Skeleton className="w-full h-full bg-white/[0.02]" />
                ) : (
                  <TradingChart
                    data={chartData?.bars || []} levels={keyLevels} symbol={activePair?.symbol}
                    indicators={chartData?.indicators} activeTimeframe={activeTimeframe}
                    onTimeframeChange={handleTimeframeChange} drawingTool={drawingTool} drawingColor={drawingColor}
                    drawings={drawings} onDrawingCreated={handleDrawingCreated} onDrawingUpdate={handleDrawingUpdate}
                    onDrawingSelect={setSelectedDrawingId} overlaySettings={overlaySettings}
                    chartColors={chartColors} indicatorColors={indicatorColors}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Execution strip */}
          <div className="flex-shrink-0 border-t border-white/[0.04] bg-[#030303]" data-testid="execution-strip">
            <button onClick={() => setExecutionOpen(!executionOpen)} className="w-full flex items-center justify-between px-3 py-1 hover:bg-white/[0.02] transition-all" data-testid="toggle-execution">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Execution</span>
                {activePair && quote && <span className="text-[10px] font-mono text-white/50">{activePair.name} {quote.price?.toFixed(dec(activePair.symbol))}</span>}
              </div>
              <div className="flex items-center gap-2">
                {!executionOpen && <><span className="text-[9px] font-mono text-[#D32F2F] font-bold">SELL</span><span className="text-white/10">|</span><span className="text-[9px] font-mono text-[#1976D2] font-bold">BUY</span></>}
                {executionOpen ? <ChevronDown className="w-3 h-3 text-white/20" /> : <ChevronUp className="w-3 h-3 text-white/20" />}
              </div>
            </button>
            {executionOpen && <div className="animate-in slide-in-from-bottom-2 duration-200"><ExecutionBridge symbol={activePair?.symbol} quote={quote} /></div>}
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        {rightPanelOpen && (
          <div className="w-[240px] flex-shrink-0 flex flex-col gap-px border-l border-white/[0.04] bg-[#030303]">
            <div className="flex-1 min-h-0" data-testid="orderbook-panel">
              <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-white/[0.04]">
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="w-3 h-3 text-[#06b6d4]" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Order Book</span>
                </div>
                <button onClick={() => setRightPanelOpen(false)} className="text-white/15 hover:text-white/50 p-0.5" data-testid="toggle-right-panel" title="Collapse right">
                  <PanelRightClose className="w-3 h-3" />
                </button>
              </div>
              <OrderBook quote={quote} symbol={activePair?.symbol} />
            </div>
            <div className="flex-1 min-h-0 flex flex-col border-t border-white/[0.04]" data-testid="levels-panel">
              <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-white/[0.04]">
                <div className="flex items-center gap-1.5"><Target className="w-3 h-3 text-[#F59E0B]" /><span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Levels</span></div>
                <div className="flex items-center gap-0.5" data-testid="htf-selector">
                  {['1hour','4hour','1day','1week','1month'].map(tf => (
                    <button key={tf} onClick={() => setHtfTimeframe(tf)} className={`px-1 py-0.5 rounded text-[8px] font-mono transition-all ${htfTimeframe === tf ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/50'}`} data-testid={`htf-${tf}`}>
                      {tf === '1hour' ? 'H1' : tf === '4hour' ? 'H4' : tf === '1day' ? 'D1' : tf === '1week' ? 'W1' : 'M1'}
                    </button>
                  ))}
                </div>
              </div>
              <ScrollArea className="flex-1"><LevelsPanel levels={keyLevels} currentPrice={quote?.price} loading={loading} /></ScrollArea>
            </div>
            <div className="flex-1 min-h-0 flex flex-col border-t border-white/[0.04]" data-testid="ai-desk-panel">
              <div className="px-2.5 py-1.5 flex items-center gap-1.5 border-b border-white/[0.04]">
                <Sparkles className="w-3 h-3 text-[#06b6d4]" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">AXE</span>
                {!axeSlot && <span className="text-[7px] text-white/10 ml-auto">slot:axe</span>}
              </div>
              {axeSlot || <AIDesk symbol={activePair?.symbol} quote={quote} levels={keyLevels} news={news} />}
            </div>
          </div>
        )}
        {/* Right-collapsed opener */}
        {!rightPanelOpen && (
          <button onClick={() => setRightPanelOpen(true)} className="absolute right-0 top-1/2 -translate-y-1/2 z-30 bg-[#111] border border-white/10 rounded-l px-0.5 py-3 text-white/20 hover:text-[#06b6d4]" data-testid="toggle-right-panel">
            <PanelRightOpen className="w-3 h-3" />
          </button>
        )}
      </div>

      <MultiChartView isOpen={showMultiChart} onClose={handleMultiChartClose} allPairs={allPairsFlat} onActiveChartChange={handleMultiChartActiveChange} />
    </div>
  );
};

export default TradingTerminal;
