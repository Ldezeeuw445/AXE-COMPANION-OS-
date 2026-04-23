import { useState, useEffect, useMemo } from 'react';
import {
  Target, Plane, Ship, TrendingUp, AlertTriangle,
  Radio, Activity, Bitcoin,
  Eye, BarChart3,
} from 'lucide-react';
import TrackingMap from '../components/TrackingMap';
import type { MapMarker } from '../components/InteractiveMap';
import { SmartMoneyBanner } from '@/features/smart-money';
import { createStubSmartMoneyDataSource } from '@/features/smart-money/examples/StubSmartMoneyDataSource';
import {
  corporateJets, vesselStream, senateTrades, insiderTrades,
  whaleTransactions, darkPoolPrints,
} from '../lib/engineAdapter';
import type { JetPosition, Vessel, VesselAlert, SenateTrade, InsiderTrade, WhaleTx, DarkPoolPrint } from '../lib/engineAdapter';

// ── Signal badge ──
function SignalBadge({ signal }: { signal: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    normal:   { bg: 'bg-green-500/15',  text: 'text-green-400',  label: 'NORMAL' },
    anomaly:  { bg: 'bg-red-500/15',    text: 'text-red-400',    label: 'ANOMALY' },
    meeting:  { bg: 'bg-yellow-500/15', text: 'text-yellow-400', label: 'MEETING' },
    regulatory: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'REGULATORY' },
  };
  const s = map[signal] || map.normal;
  return <span className={`text-[7px] px-1.5 py-0.5 rounded font-bold ${s.bg} ${s.text}`}>{s.label}</span>;
}

function FlightHeatmapToday({
  jets,
}: {
  jets: JetPosition[];
}) {
  const byTicker = new Map<string, { ticker: string; company: string; count: number; color: string }>();
  for (const j of jets) {
    const t = (j.ticker || '—').toUpperCase();
    const existing = byTicker.get(t);
    if (existing) existing.count += 1;
    else byTicker.set(t, { ticker: t, company: j.company, count: 1, color: BRAND_COLORS[t] || '#06b6d4' });
  }

  const rows = Array.from(byTicker.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const max = rows[0]?.count ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-[8px] text-white/30 uppercase tracking-wider">FLIGHT HEATMAP — TODAY</div>
        <div className="text-[8px] text-white/20 tabular-nums">{rows.length} tickers</div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-2 rounded-md border border-white/[0.05] bg-white/[0.02] px-2 py-2 text-[9px] text-white/35">
          No flights yet.
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {rows.map((r) => {
            const pct = max ? Math.max(0.06, r.count / max) : 0;
            const tooltip = `${r.ticker} · ${r.company} — ${r.count} flight${r.count === 1 ? '' : 's'} today`;
            return (
              <div
                key={r.ticker}
                className="group relative grid grid-cols-[44px_1fr_26px] items-center gap-2"
                title={tooltip}
              >
                <div className="pointer-events-none absolute -top-10 left-14 z-40 hidden max-w-[260px] rounded-md border border-white/[0.12] bg-[#0f1016]/95 px-2 py-1.5 text-[9px] text-white/80 shadow-2xl backdrop-blur-sm group-hover:block">
                  <div className="font-semibold text-white/90">{r.company}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-white/60">
                    <span className="font-mono">{r.ticker}</span>
                    <span className="text-white/25">·</span>
                    <span className="tabular-nums">{r.count} today</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: r.color, boxShadow: `0 0 10px ${r.color}55` }}
                    aria-hidden
                  />
                  <span className="text-[9px] font-semibold text-white/70 tabular-nums">{r.ticker}</span>
                </div>

                <div className="relative h-3 overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.02]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md"
                    style={{
                      width: `${Math.round(pct * 100)}%`,
                      background: `linear-gradient(90deg, ${r.color}55, ${r.color}22)`,
                      borderRight: '1px solid rgba(255,255,255,0.08)',
                    }}
                  />
                  <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:10px_100%]" />
                </div>

                <div className="text-right text-[9px] font-semibold text-white/35 tabular-nums">{r.count}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Vessel status badge ──
function VesselStatus({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    in_transit: { bg: 'bg-green-500/15', text: 'text-green-400' },
    anchored:   { bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
    loitering:  { bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
    ais_gap:    { bg: 'bg-red-500/15', text: 'text-red-400' },
  };
  const s = map[status] || map.in_transit;
  const label = status.replace('_', ' ').toUpperCase();
  return <span className={`text-[7px] px-1.5 py-0.5 rounded font-bold ${s.bg} ${s.text}`}>{label}</span>;
}

// ── Brand colors per company ticker ──
const BRAND_COLORS: Record<string, string> = {
  AAPL: '#06b6d4', NVDA: '#22c55e', JPM: '#eab308', META: '#a855f7',
  TSLA: '#ef4444', AMZN: '#f97316', MSFT: '#3b82f6', GS: '#eab308',
  GOOGL: '#22c55e', 'BRK.B': '#06b6d4', XOM: '#f472b6', CVX: '#34d399',
};

// ── Convert jet data to MapMarker with brand colors ──
function jetMarkers(jets: JetPosition[]): MapMarker[] {
  return jets.map((j, i) => {
    const heading = String((j.ticker.charCodeAt(0) * 11 + i * 17) % 360);
    return {
      id: j.icao24,
      lat: j.lat,
      lon: j.lon,
      color: BRAND_COLORS[j.ticker] || '#06b6d4',
      label: `${j.company} (${j.ticker})`,
      icon: 'plane' as const,
      details: {
        aircraft: j.aircraft,
        route: j.route,
        altitude: `${j.altitude.toLocaleString()} ft`,
        speed: `${j.speed} kts`,
        signal: j.signal.toUpperCase(),
        eta: j.eta,
        heading,
      },
    };
  });
}

// ── Convert vessel data to MapMarker ──
function vesselMarkers(vessels: Vessel[]): MapMarker[] {
  const statusColor = (v: Vessel) =>
    v.status === 'ais_gap'
      ? '#ef4444'
      : v.status === 'loitering'
        ? '#eab308'
        : v.status === 'anchored'
          ? '#06b6d4'
          : '#22c55e';
  return vessels.map((v) => {
    const tick = v.operatorTicker?.toUpperCase();
    const brand = tick ? BRAND_COLORS[tick] : undefined;
    return {
      id: v.mmsi,
      lat: v.lat,
      lon: v.lon,
      color: brand || statusColor(v),
      label: tick ? `${v.name} · ${tick}` : v.name,
      icon: 'ship' as const,
      details: {
        type: v.type,
        destination: v.destination,
        speed: `${v.speed} kn`,
        status: v.status.replace('_', ' ').toUpperCase(),
        eta: v.eta,
        ...(tick ? { operator: tick } : {}),
      },
    };
  });
}

export default function Intel() {
  /** Strait of Hormuz etc. on map when live (prod: `VITE_VESSEL_FEED_LIVE=true`) or in dev unless disabled. */
  const vesselFeedLive =
    import.meta.env.VITE_VESSEL_FEED_LIVE === 'true' ||
    (import.meta.env.DEV && import.meta.env.VITE_VESSEL_FEED_LIVE !== 'false');

  const smartMoneyDS = useMemo(() => createStubSmartMoneyDataSource(), []);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [jets, setJets] = useState<JetPosition[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [vesselAlerts, setVesselAlerts] = useState<VesselAlert[]>([]);
  const [senate, setSenate] = useState<SenateTrade[]>([]);
  const [insiders, setInsiders] = useState<InsiderTrade[]>([]);
  const [whales, setWhales] = useState<WhaleTx[]>([]);
  const [darkPool, setDarkPool] = useState<DarkPoolPrint[]>([]);
  const [vesselTab, setVesselTab] = useState<'vessels' | 'chokepoints' | 'signals'>('vessels');

  useEffect(() => {
    corporateJets().then(setJets);
    vesselStream().then(({ vessels, alerts }) => { setVessels(vessels); setVesselAlerts(alerts); });
    senateTrades().then(setSenate);
    insiderTrades().then(setInsiders);
    whaleTransactions().then(setWhales);
    darkPoolPrints().then(setDarkPool);
  }, []);

  const jetMapMarkers = useMemo(() => jetMarkers(jets), [jets]);
  const vesselMapMarkers = useMemo(() => vesselMarkers(vessels), [vessels]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Target size={14} className="text-cyan-400" />
          <span className="text-[10px] text-white/40 px-1.5 py-0.5 bg-white/5 rounded">INTEL</span>
          <span className="text-[10px] text-white/30">Alternative Data Intelligence</span>
        </div>
        <span className="text-[9px] text-green-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> LIVE
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* ── SMART MONEY SIGNALS (NEW, full-width thin banner) ── */}
        <div className="w-full" style={{ height: 115 }}>
          <SmartMoneyBanner
            dataSource={smartMoneyDS}
            activeSymbol={activeSymbol}
            onSignalSelect={(s: { symbol: string }) => setActiveSymbol(s.symbol)}
            windowHours={48}
            refreshMs={30000}
          />
        </div>

        {/* ════════════════════════════════════════════
            ROW 1: JET INTELLIGENCE + VESSEL TRACKING
        ════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-3">

          {/* ── CORPORATE JET INTELLIGENCE ── */}
          <div className="tos-card rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plane size={12} className="text-white/50" />
                <span className="text-[10px] font-semibold text-white/50">CORPORATE JET INTELLIGENCE</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> LIVE</span>
                <span className="text-[8px] text-white/25">{new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
              </div>
            </div>
            <div className="p-3 space-y-3">
              <TrackingMap markers={jetMapMarkers} mode="jets" height={300} />
              {/* Anomaly feed */}
              <div className="space-y-1">
                {jets.filter(j => j.signal !== 'normal').slice(0, 3).map((j, i) => (
                  <div key={i} className="flex items-center gap-2 text-[9px]">
                    <AlertTriangle size={9} className={j.signal === 'anomaly' ? 'text-red-400' : j.signal === 'meeting' ? 'text-yellow-400' : 'text-orange-400'} />
                    <span className="text-white/50 uppercase font-bold">{j.signal}</span>
                    <span className="text-white/40">—</span>
                    <span className="text-white/60">{j.ticker} {j.aircraft} → {j.route}</span>
                    {j.signal === 'anomaly' && <span className="text-red-400/60">Unusual destination</span>}
                  </div>
                ))}
              </div>
              {/* Jet table */}
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-[9px]">
                  <thead>
                    <tr className="border-b border-white/[0.05]">
                      {['TIME', 'COMPANY', 'AIRCRAFT', 'ROUTE', 'ALT', 'SPD', 'SIGNAL'].map(h => (
                        <th key={h} className="px-1.5 py-1.5 text-left text-[8px] text-white/30 uppercase tracking-wider font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jets.slice(0, 8).map((j, i) => (
                      <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                        <td className="px-1.5 py-1.5 text-white/30">{j.departureTime.slice(11, 16)}</td>
                        <td className="px-1.5 py-1.5 text-white/60 font-medium">{j.company}</td>
                        <td className="px-1.5 py-1.5 text-white/40">{j.aircraft}</td>
                        <td className="px-1.5 py-1.5 text-white/40">{j.route}</td>
                        <td className="px-1.5 py-1.5 text-white/40 tabular-nums">{j.altitude.toLocaleString()}</td>
                        <td className="px-1.5 py-1.5 text-white/40 tabular-nums">{j.speed}</td>
                        <td className="px-1.5 py-1.5"><SignalBadge signal={j.signal} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <FlightHeatmapToday jets={jets} />
            </div>
          </div>

          {/* ── VESSEL TRACKING INTELLIGENCE ── */}
          <div className="tos-card rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ship size={12} className="text-white/50" />
                <span className="text-[10px] font-semibold text-white/50">VESSEL TRACKING INTELLIGENCE</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-cyan-400 flex items-center gap-1"><Radio size={8} /> SIMULATED</span>
                <span className="text-[8px] text-white/25">14:23 UTC</span>
              </div>
            </div>
            <div className="p-3 space-y-3">
              <TrackingMap
                markers={vesselMapMarkers}
                mode="vessels"
                height={300}
                vesselFeedLive={vesselFeedLive}
              />
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="stat-box text-center">
                  <div className="stat-label">DISRUPTED</div>
                  <div className="text-lg font-bold text-red-400">14</div>
                </div>
                <div className="stat-box text-center">
                  <div className="stat-label">ALERTS</div>
                  <div className="text-lg font-bold text-yellow-400">4</div>
                </div>
                <div className="stat-box text-center">
                  <div className="stat-label">TRACKED</div>
                  <div className="text-lg font-bold text-cyan-400">2,847</div>
                </div>
              </div>
              {/* Alerts feed */}
              <div className="space-y-1.5">
                {vesselAlerts.slice(0, 4).map((a, i) => (
                  <div key={i} className="flex items-start gap-2 p-1.5 rounded bg-white/[0.02] border border-white/[0.03]">
                    <AlertTriangle size={9} className="text-yellow-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[9px] text-white/60">{a.message}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[7px] px-1 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold">{a.category}</span>
                        <span className="text-[7px] text-white/20">{a.timestamp}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Sub-tabs */}
              <div className="flex gap-1">
                {(['vessels', 'chokepoints', 'signals'] as const).map(t => (
                  <button key={t} onClick={() => setVesselTab(t)} className={`px-2 py-1 rounded text-[9px] capitalize ${vesselTab === t ? 'bg-cyan-500/20 text-cyan-400' : 'text-white/40 hover:text-white/60'}`}>{t}</button>
                ))}
              </div>
              {/* Vessel table */}
              {vesselTab === 'vessels' && (
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-[9px]">
                    <thead><tr className="border-b border-white/[0.05]">
                      {['VESSEL', 'FLAG', 'ROUTE', 'SPD', 'STATUS'].map(h => <th key={h} className="px-1.5 py-1.5 text-left text-[8px] text-white/30 uppercase font-medium">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {vessels.map((v, i) => (
                        <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                          <td className="px-1.5 py-1.5 text-white/60 font-medium">{v.name}</td>
                          <td className="px-1.5 py-1.5 text-white/30">{v.type}</td>
                          <td className="px-1.5 py-1.5 text-white/40">→ {v.destination}</td>
                          <td className="px-1.5 py-1.5 text-white/40 tabular-nums">{v.speed}kn</td>
                          <td className="px-1.5 py-1.5"><VesselStatus status={v.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════
            ROW 2: SMART MONEY + INSIDER + WHALE
        ════════════════════════════════════════════ */}
        <div className="grid grid-cols-3 gap-3">

          {/* ── SMART MONEY FLOW ── */}
          <div className="tos-card rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.05] flex items-center gap-2">
              <TrendingUp size={12} className="text-white/50" />
              <span className="text-[10px] font-semibold text-white/50">SMART MONEY FLOW</span>
            </div>
            <div className="p-3">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-[9px]">
                  <thead><tr className="border-b border-white/[0.05]">
                    {['POLITICIAN', 'TICKER', 'DIR', 'SIZE', 'DATE'].map(h => <th key={h} className="px-1.5 py-1.5 text-left text-[8px] text-white/30 uppercase font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {senate.map((s, i) => (
                      <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                        <td className="px-1.5 py-1.5 text-white/60">{s.politician}</td>
                        <td className="px-1.5 py-1.5 text-white/70 font-medium">{s.ticker}</td>
                        <td className={`px-1.5 py-1.5 font-bold ${s.direction === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{s.direction}</td>
                        <td className="px-1.5 py-1.5 text-white/50">{s.size}</td>
                        <td className="px-1.5 py-1.5 text-white/30">{s.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── INSIDER TRANSACTIONS ── */}
          <div className="tos-card rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.05] flex items-center gap-2">
              <Eye size={12} className="text-white/50" />
              <span className="text-[10px] font-semibold text-white/50">INSIDER TRANSACTIONS</span>
            </div>
            <div className="p-3">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-[9px]">
                  <thead><tr className="border-b border-white/[0.05]">
                    {['TICKER', 'INSIDER', 'TYPE', 'VALUE'].map(h => <th key={h} className="px-1.5 py-1.5 text-left text-[8px] text-white/30 uppercase font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {insiders.map((t, i) => (
                      <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                        <td className="px-1.5 py-1.5 text-white/70 font-medium">{t.ticker}</td>
                        <td className="px-1.5 py-1.5 text-white/50">{t.insider}</td>
                        <td className={`px-1.5 py-1.5 font-bold ${t.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{t.type}</td>
                        <td className="px-1.5 py-1.5 text-white/60 tabular-nums">${(t.value / 1e6).toFixed(0)}M</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── WHALE ACTIVITY ── */}
          <div className="tos-card rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.05] flex items-center gap-2">
              <Bitcoin size={12} className="text-white/50" />
              <span className="text-[10px] font-semibold text-white/50">WHALE ACTIVITY</span>
            </div>
            <div className="p-3">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-[9px]">
                  <thead><tr className="border-b border-white/[0.05]">
                    {['CHAIN', 'FROM→TO', 'AMOUNT', 'TYPE'].map(h => <th key={h} className="px-1.5 py-1.5 text-left text-[8px] text-white/30 uppercase font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {whales.map((w, i) => (
                      <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                        <td className="px-1.5 py-1.5">
                          <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${w.chain === 'BTC' ? 'bg-orange-500/15 text-orange-400' : w.chain === 'ETH' ? 'bg-purple-500/15 text-purple-400' : 'bg-cyan-500/15 text-cyan-400'}`}>{w.chain}</span>
                        </td>
                        <td className="px-1.5 py-1.5 text-white/50">{w.from} <span className="text-white/20">→</span> {w.to}</td>
                        <td className="px-1.5 py-1.5 text-white/60 tabular-nums">${(w.amountUsd / 1e6).toFixed(1)}M</td>
                        <td className="px-1.5 py-1.5 text-white/40">{w.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════
            ROW 3: DARK POOL + UNUSUAL OPTIONS
        ════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-3">

          {/* ── DARK POOL PRINTS ── */}
          <div className="tos-card rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 size={12} className="text-white/50" />
                <span className="text-[10px] font-semibold text-white/50">DARK POOL PRINTS</span>
              </div>
              <span className="text-[8px] text-white/30">24H</span>
            </div>
            <div className="p-3">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-[9px]">
                  <thead><tr className="border-b border-white/[0.05]">
                    {['SYMBOL', 'PRICE', 'SIZE', 'NOTIONAL ($)'].map(h => <th key={h} className="px-1.5 py-1.5 text-left text-[8px] text-white/30 uppercase font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {darkPool.slice(0, 12).map((d, i) => (
                      <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                        <td className="px-1.5 py-1.5 text-white/70 font-medium">{d.symbol}</td>
                        <td className="px-1.5 py-1.5 text-white/60 tabular-nums">{d.price.toFixed(2)}</td>
                        <td className="px-1.5 py-1.5 text-white/50 tabular-nums">{d.size.toLocaleString()}</td>
                        <td className="px-1.5 py-1.5 text-white/60 tabular-nums">${(d.notional / 1e6).toFixed(1)}M</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── UNUSUAL OPTIONS ACTIVITY ── */}
          <div className="tos-card rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.05] flex items-center gap-2">
              <Activity size={12} className="text-white/50" />
              <span className="text-[10px] font-semibold text-white/50">UNUSUAL OPTIONS ACTIVITY</span>
            </div>
            <div className="p-3">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-[9px]">
                  <thead><tr className="border-b border-white/[0.05]">
                    {['SYMBOL', 'STRIKE', 'EXP', 'VOLUME', 'OI', 'SIDE'].map(h => <th key={h} className="px-1.5 py-1.5 text-left text-[8px] text-white/30 uppercase font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {[
                      { s: 'NVDA', strike: 900, exp: 'Apr 25', vol: 45000, oi: 120000, side: 'CALL' },
                      { s: 'TSLA', strike: 180, exp: 'Apr 25', vol: 32000, oi: 85000, side: 'PUT' },
                      { s: 'AAPL', strike: 175, exp: 'May 2', vol: 28000, oi: 95000, side: 'CALL' },
                      { s: 'AMD', strike: 165, exp: 'Apr 25', vol: 24000, oi: 68000, side: 'CALL' },
                      { s: 'META', strike: 520, exp: 'May 9', vol: 19000, oi: 72000, side: 'PUT' },
                      { s: 'AMZN', strike: 190, exp: 'Apr 25', vol: 17000, oi: 55000, side: 'CALL' },
                      { s: 'PLTR', strike: 25, exp: 'May 2', vol: 15000, oi: 42000, side: 'CALL' },
                      { s: 'COIN', strike: 220, exp: 'Apr 25', vol: 12000, oi: 38000, side: 'CALL' },
                    ].map((o, i) => (
                      <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                        <td className="px-1.5 py-1.5 text-white/70 font-medium">{o.s}</td>
                        <td className="px-1.5 py-1.5 text-white/60">${o.strike}</td>
                        <td className="px-1.5 py-1.5 text-white/40">{o.exp}</td>
                        <td className="px-1.5 py-1.5 text-white/50 tabular-nums">{o.vol.toLocaleString()}</td>
                        <td className="px-1.5 py-1.5 text-white/40 tabular-nums">{o.oi.toLocaleString()}</td>
                        <td className={`px-1.5 py-1.5 font-bold ${o.side === 'CALL' ? 'text-green-400' : 'text-red-400'}`}>{o.side}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[8px] text-white/20 mt-2">Coming via Unusual Whales upgrade</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
