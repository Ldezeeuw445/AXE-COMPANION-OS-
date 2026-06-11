import Link from "next/link";
import { Activity, Anchor, BarChart3, Eye, Landmark, TrendingUp, Plane, Ship, Swords, Zap, Shield, Radar, AlertTriangle } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { listWatchlistItems } from "@/app/(app)/settings/actions";
import { loadIntelSnapshot, type IntelProviderStatus, type IntelSnapshot, type Chokepoint } from "@/lib/intel/intelClient";
import { IntelAiChat } from "@/components/intel/IntelAiChat";
import { CorrelateButton } from "@/components/intel/CorrelateButton";
import { CorrelationEngine } from "@/components/intel/CorrelationEngine";
import { ConvictionEngine } from "@/components/intel/ConvictionEngine";

const DEFAULT_SYMBOL = "XAUUSD";

function chatQ(text: string): string {
  return `/chat?q=${encodeURIComponent(text)}`;
}

type PageProps = {
  searchParams: Promise<{ symbol?: string }>;
};

export default async function IntelPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const requestedSymbol = (sp.symbol ?? "").trim().toUpperCase();
  const watchlist = (await listWatchlistItems()).map((w) => w.symbol);
  const symbol = requestedSymbol || watchlist[0]?.toUpperCase() || DEFAULT_SYMBOL;

  const intel = await loadIntelSnapshot({ symbol });
  const isStale = intel.cache.state === "stale";
  const hasFreshLiveIntel = intel.hasLiveData && !isStale;

  const toolbarSections: AxeToolbarSection[] = [
    {
      id: "ask-axe",
      title: "Ask AXE",
      items: [
        {
          id: "smart-money",
          label: "What is smart money doing?",
          description: `${symbol} — insider, congress, dark pool, options flow`,
          href: chatQ(
            `[AXE · intel]\nGive me a smart-money read on ${symbol} right now: insider buys, congressional activity, dark-pool prints and unusual options flow. Be specific about names, sizes and timing.`,
          ),
        },
        {
          id: "tide",
          label: "Read the market tide",
          description: "Net call vs put premium right now",
          href: chatQ(
            `[AXE · intel]\nWhat is the broad market tide saying right now (net call premium vs net put premium)? Translate it into a directional bias for ${symbol}.`,
          ),
        },
      ],
    },
    {
      id: "actions",
      title: "Actions",
      items: [
        {
          id: "correlate",
          label: "Make Intel Correlation",
          description: "AI cross-feed analysis",
          href: "#correlate",
        },
        {
          id: "chart",
          label: "Open chart",
          description: `Chart ${symbol}`,
          href: `/chart?symbol=${encodeURIComponent(symbol)}`,
        },
        {
          id: "alert",
          label: "Create alert",
          description: "Insider, options, or price",
          href: `/alerts?symbol=${encodeURIComponent(symbol)}`,
        },
      ],
    },
  ];

  const liveProviderCount = intel.providers.filter((p) => p.state === "live").length;

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col overflow-y-auto gap-4 pb-6">
      {/* Mobile top bar: AXE wordmark + pulse is the single live
          indicator now — see `AxeWordmarkLive`. We pass our provider
          counts and freshness through `LiveStatusReporter`. The
          provider grid below is the detail view. */}
      <AxeTopBarInjector
        title="Intel"
        subtitle={`${symbol} AXE Intel flow`}
        sections={toolbarSections}
      />
      <LiveStatusReporter
        liveCount={liveProviderCount}
        totalCount={intel.providers.length}
        freshestAgeSec={intel.cache.ageSeconds ?? null}
        label="Intel"
        allLiveOverride={hasFreshLiveIntel ? true : intel.hasLiveData ? false : null}
      />

      {intel.cache.message ? (
        <GlassPanel className="p-3">
          <p className="text-xs leading-relaxed text-tos-muted">
            {intel.cache.message}
            {intel.cache.ageSeconds != null ? ` Last cached ${formatAge(intel.cache.ageSeconds)} ago.` : ""}
          </p>
        </GlassPanel>
      ) : null}

      {/* ── AXE CONVICTION ENGINE ──────────────────────────────── */}
      <ConvictionEngine />

      {/* MARKET TIDE */}
      <GlassPanel className="p-4" glow="none">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-emerald-300/85" aria-hidden />
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
              AXE Intel Tide
            </h2>
          </div>
          <InlineStatus providers={intel.providers} id="marketTide" />
        </div>
        {intel.tide ? (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Tile
              label="Net call premium"
              value={formatMoneyM(intel.tide.netCallPremium)}
              accent="positive"
            />
            <Tile
              label="Net put premium"
              value={formatMoneyM(intel.tide.netPutPremium)}
              accent="negative"
            />
            <Tile
              label="Bias"
              value={intel.tide.bias.toUpperCase()}
              accent={
                intel.tide.bias === "bullish"
                  ? "positive"
                  : intel.tide.bias === "bearish"
                    ? "negative"
                    : "neutral"
              }
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-tos-muted">
            Market tide has not cached a usable row yet. AXE will retry quietly without exposing provider rate-limit errors.
          </p>
        )}
      </GlassPanel>

      {/* INSIDER + CONGRESS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <GlassPanel className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-emerald-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                AXE Insider Flow
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-tos-dim">{intel.insiders.length > 0 ? `${intel.insiders.length} latest` : ""}</span>
              <InlineStatus providers={intel.providers} id="insiderTrades" />
            </div>
          </div>
          {intel.insiders.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.insiders.slice(0, 10).map((row, i) => (
                <li
                  key={`${row.ticker}-${row.date}-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-[#0a0a0d]/90 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold text-tos-text">{row.ticker}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-tos-text" title={row.insider}>
                    {row.insider}
                    {row.role && row.role !== "—" ? (
                      <span className="ml-1 text-[10px] text-tos-dim">· {row.role}</span>
                    ) : null}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-semibold uppercase ${
                      row.type === "BUY" ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {row.type}
                  </span>
                  <span className="font-mono text-[10px] text-tos-dim">{formatMoneyShort(row.value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-tos-muted">
              {intel.providers.find((p) => p.id === "insiderTrades")?.description ?? "No insider feed yet."}
            </p>
          )}
        </GlassPanel>

        <GlassPanel className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="h-3.5 w-3.5 text-emerald-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                AXE Policy Flow
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-tos-dim">{intel.senate.length > 0 ? `${intel.senate.length} disclosures` : ""}</span>
              <InlineStatus providers={intel.providers} id="senateTrades" />
            </div>
          </div>
          {intel.senate.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.senate.slice(0, 10).map((row, i) => (
                <li
                  key={`${row.ticker}-${row.politician}-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-[#0a0a0d]/90 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold text-tos-text">{row.ticker}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-tos-text" title={row.politician}>
                    {row.politician}
                    <span className="ml-1 text-[10px] text-tos-dim">· {row.chamber}</span>
                  </span>
                  <span
                    className={`font-mono text-[10px] font-semibold uppercase ${
                      row.direction === "BUY" ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {row.direction}
                  </span>
                  <span className="font-mono text-[10px] text-tos-dim">{row.size}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-tos-muted">
              {intel.providers.find((p) => p.id === "senateTrades")?.description ?? "No congressional feed yet."}
            </p>
          )}
        </GlassPanel>
      </div>

      {/* DARK POOL + OPTIONS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <GlassPanel className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-emerald-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                AXE Dark Pool
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-tos-dim">{intel.darkPool.length > 0 ? `Top ${Math.min(10, intel.darkPool.length)}` : ""}</span>
              <InlineStatus providers={intel.providers} id="darkPoolPrints" />
            </div>
          </div>
          {intel.darkPool.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.darkPool.slice(0, 10).map((row, i) => (
                <li
                  key={`${row.symbol}-${row.time ?? i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-[#0a0a0d]/90 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold text-tos-text">{row.symbol}</span>
                  <span className="font-mono text-[10px] text-tos-muted">${row.price.toFixed(2)}</span>
                  <span className="font-mono text-[10px] text-tos-muted">{row.size.toLocaleString()}</span>
                  {row.side ? (
                    <span
                      className={`font-mono text-[10px] font-semibold uppercase ${
                        row.side === "buy" ? "text-emerald-300" : row.side === "sell" ? "text-rose-300" : "text-tos-dim"
                      }`}
                    >
                      {row.side}
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-[10px] font-semibold text-tos-text">
                    {formatMoneyShort(row.notional)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-tos-muted">
              {intel.providers.find((p) => p.id === "darkPoolPrints")?.description ?? "No dark-pool feed yet."}
            </p>
          )}
        </GlassPanel>

        <GlassPanel className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                AXE Options Flow
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-tos-dim">{intel.options.length > 0 ? `Top ${Math.min(10, intel.options.length)} by premium` : ""}</span>
              <InlineStatus providers={intel.providers} id="unusualOptions" />
            </div>
          </div>
          {intel.options.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.options.slice(0, 10).map((row, i) => (
                <li
                  key={`${row.symbol}-${row.exp}-${row.strike}-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-[#0a0a0d]/90 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold text-tos-text">{row.symbol}</span>
                  <span className="font-mono text-[10px] text-tos-muted">${row.strike.toFixed(2)}</span>
                  <span className="font-mono text-[10px] text-tos-dim">{row.exp}</span>
                  <span
                    className={`ml-auto font-mono text-[10px] font-semibold uppercase ${
                      row.side === "CALL" ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {row.side}
                  </span>
                  <span className="font-mono text-[10px] text-tos-text">{formatMoneyShort(row.premium)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-tos-muted">
              {intel.providers.find((p) => p.id === "unusualOptions")?.description ?? "No options-flow feed yet."}
            </p>
          )}
        </GlassPanel>
      </div>

      {/* ─── ALT-DATA: CORPORATE JETS ─────────────────────────── */}
      <GlassPanel className="p-4" glow="none">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plane className="h-3.5 w-3.5 text-emerald-300/85" aria-hidden />
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
              AXE Jet Tracker
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-tos-dim">
              {intel.jets.length > 0 ? `${intel.jets.filter((j) => !j.onGround).length} airborne · ${intel.jets.length} tracked` : ""}
            </span>
            <InlineStatus providers={intel.providers} id="corporateJets" />
          </div>
        </div>
        {intel.jets.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {/* Airborne jets first */}
            {intel.jets
              .filter((j) => !j.onGround)
              .slice(0, 8)
              .map((jet, i) => (
                <li
                  key={`${jet.icao24}-air-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-[#0a0a0d]/90 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold text-emerald-200/90">{jet.ticker || jet.icao24}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-tos-text" title={jet.company}>
                    {jet.company}
                    {jet.tailNumber && <span className="ml-1 text-[10px] text-tos-dim">· {jet.tailNumber}</span>}
                  </span>
                  <span className="font-mono text-[10px] text-emerald-300">AIRBORNE</span>
                  {jet.altitude != null && (
                    <span className="font-mono text-[10px] text-tos-dim">{Math.round(jet.altitude)}m</span>
                  )}
                  {jet.velocity != null && (
                    <span className="font-mono text-[10px] text-tos-dim">{Math.round(jet.velocity)}m/s</span>
                  )}
                </li>
              ))}
            {/* Grounded jets */}
            {intel.jets
              .filter((j) => j.onGround)
              .slice(0, 8)
              .map((jet, i) => (
                <li
                  key={`${jet.icao24}-gnd-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.04] bg-[#0a0a0d]/60 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold text-tos-dim">{jet.ticker || jet.icao24}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-tos-muted" title={jet.company}>
                    {jet.company}
                    {jet.tailNumber && <span className="ml-1 text-[10px] text-tos-dim">· {jet.tailNumber}</span>}
                  </span>
                  <span className="font-mono text-[10px] text-tos-dim">GROUNDED</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-tos-muted">
            {intel.providers.find((p) => p.id === "corporateJets")?.description ?? "No corporate jet data yet."}
          </p>
        )}
      </GlassPanel>

      {/* ─── ALT-DATA: MILITARY RADAR + EMERGENCY MONITOR ──────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <GlassPanel className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radar className="h-3.5 w-3.5 text-amber-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                AXE Military Radar
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-tos-dim">
                {intel.military.length > 0
                  ? `${intel.military.filter((m) => !m.onGround).length} airborne · ${intel.military.length} tracked`
                  : ""}
              </span>
              <InlineStatus providers={intel.providers} id="militaryRadar" />
            </div>
          </div>
          {intel.military.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.military.slice(0, 12).map((m, i) => (
                <li
                  key={`${m.hex}-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-[#0a0a0d]/90 px-3 py-2"
                >
                  <span className={`font-mono text-[10px] font-semibold uppercase ${
                    m.category === "bomber" ? "text-rose-300" :
                    m.category === "fighter" ? "text-rose-300/80" :
                    m.category === "isr" ? "text-amber-200" :
                    m.category === "tanker" ? "text-blue-300/80" :
                    m.category === "transport" ? "text-emerald-300/80" :
                    "text-tos-dim"
                  }`}>
                    {m.category}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-tos-text">
                    {m.aircraftType}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-tos-dim">
                    {m.callsign || m.registration || m.hex}
                  </span>
                  {m.onGround ? (
                    <span className="font-mono text-[10px] text-tos-dim">GROUND</span>
                  ) : (
                    <>
                      <span className="font-mono text-[10px] text-emerald-300">
                        FL{m.altitude != null ? Math.round(m.altitude / 100) : "?"}
                      </span>
                      {m.groundSpeed != null && (
                        <span className="font-mono text-[10px] text-tos-dim">{Math.round(m.groundSpeed)}kt</span>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-tos-muted">
              {intel.providers.find((p) => p.id === "militaryRadar")?.description ?? "No military aircraft data yet."}
            </p>
          )}
        </GlassPanel>

        <GlassPanel className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                AXE Emergency Monitor
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-tos-dim">
                {intel.emergency.length > 0 ? `${intel.emergency.length} active` : "clear"}
              </span>
              <InlineStatus providers={intel.providers} id="emergencyMonitor" />
            </div>
          </div>
          {intel.emergency.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.emergency.slice(0, 8).map((e, i) => (
                <li
                  key={`${e.hex}-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-bold text-rose-300">SQK 7700</span>
                  <span className="font-mono text-[11px] font-semibold text-tos-text">
                    {e.aircraftType}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-tos-dim">
                    {e.callsign || e.registration || e.hex}
                  </span>
                  {e.altitude != null && (
                    <span className="font-mono text-[10px] text-amber-200">
                      FL{Math.round(e.altitude / 100)}
                    </span>
                  )}
                  {e.groundSpeed != null && (
                    <span className="font-mono text-[10px] text-tos-dim">{Math.round(e.groundSpeed)}kt</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-3 text-center">
              <span className="font-mono text-[11px] font-semibold text-emerald-300/80">ALL CLEAR</span>
              <p className="mt-1 text-[10px] text-tos-dim">No aircraft broadcasting emergency squawk 7700</p>
            </div>
          )}
        </GlassPanel>
      </div>

      {/* ─── ALT-DATA: VESSEL TRACKING + ENERGY ────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <GlassPanel className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ship className="h-3.5 w-3.5 text-emerald-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                AXE Vessel Intel
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-tos-dim">{intel.vessels.length > 0 ? `${intel.vessels.length} tracked` : ""}</span>
              <InlineStatus providers={intel.providers} id="vesselTracking" />
            </div>
          </div>
          {intel.vessels.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.vessels.slice(0, 8).map((v, i) => (
                <li
                  key={`${v.mmsi}-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-[#0a0a0d]/90 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold text-tos-text">
                    {v.vesselName || v.mmsi}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-tos-dim">{v.vesselType}</span>
                  <span className="font-mono text-[10px] text-tos-muted">{v.destination || v.nearChokepoint || "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-tos-muted">
              {intel.providers.find((p) => p.id === "vesselTracking")?.description ?? "No vessel data yet."}
            </p>
          )}
        </GlassPanel>

        <GlassPanel className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-emerald-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                AXE Energy Flow
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-tos-dim">{intel.energy.length > 0 ? `${intel.energy.length} data points` : ""}</span>
              <InlineStatus providers={intel.providers} id="energyFlows" />
            </div>
          </div>
          {intel.energy.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {/* Deduplicate by seriesId, show latest period per series */}
              {deduplicateEnergy(intel.energy).map((e, i) => (
                <li
                  key={`${e.seriesId}-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-[#0a0a0d]/90 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[11px] text-tos-text">{e.seriesName}</span>
                  <span className="font-mono text-[10px] font-semibold text-white/90">
                    {e.value != null ? formatEnergyValue(e.value, e.unit) : "—"}
                  </span>
                  <span className="font-mono text-[10px] text-tos-dim">{e.period}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-tos-muted">
              {intel.providers.find((p) => p.id === "energyFlows")?.description ?? "No energy data yet."}
            </p>
          )}
        </GlassPanel>
      </div>

      {/* ─── ALT-DATA: CHOKEPOINTS ──────────────────────────── */}
      {intel.chokepoints && intel.chokepoints.length > 0 && (
        <GlassPanel className="p-4" glow="none">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-center gap-2">
              <Anchor className="h-3.5 w-3.5 text-emerald-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                Global Chokepoints
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-tos-dim">
                {intel.chokepoints.filter((cp) => cp.riskLevel === "critical").length} critical · {intel.chokepoints.length} monitored
              </span>
              <InlineStatus providers={intel.providers} id="chokepoints" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {intel.chokepoints.map((cp) => (
              <div
                key={cp.id}
                className={`rounded-lg border px-3 py-2 ${
                  cp.riskLevel === "critical" ? "border-rose-400/25 bg-rose-400/[0.06]" :
                  cp.riskLevel === "high" ? "border-amber-400/20 bg-amber-400/[0.04]" :
                  "border-white/[0.05] bg-[#0a0a0d]/90"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-tos-text">{cp.name}</span>
                  <span className={`font-mono text-[10px] font-semibold uppercase ${
                    cp.riskLevel === "critical" ? "text-rose-300" :
                    cp.riskLevel === "high" ? "text-amber-200" :
                    cp.riskLevel === "medium" ? "text-yellow-200/60" :
                    "text-tos-dim"
                  }`}>
                    {cp.riskLevel}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-3 text-[10px] text-tos-dim">
                  <span>{cp.region}</span>
                  <span className="font-mono">{cp.dailyShipCount} ships/day</span>
                  <span className="font-mono">{cp.percentageGlobalTrade}% trade</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-tos-muted">
                  {cp.riskFactors}
                </p>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* ─── ALT-DATA: CONFLICTS + CYBER ───────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <GlassPanel className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Swords className="h-3.5 w-3.5 text-rose-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                AXE Seismic Events
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-tos-dim">{intel.conflicts.length > 0 ? `${intel.conflicts.length} events` : ""}</span>
              <InlineStatus providers={intel.providers} id="conflictEvents" />
            </div>
          </div>
          {intel.conflicts.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.conflicts.slice(0, 8).map((c, i) => (
                <li
                  key={`${c.eventId}-${i}`}
                  className="flex flex-col gap-1 rounded-lg border border-white/[0.05] bg-[#0a0a0d]/90 px-3 py-2"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-[11px] font-semibold text-tos-text">
                      {c.eventType}{c.subEventType ? ` ${c.subEventType}` : ""}
                    </span>
                    <span className="text-[10px] text-tos-dim">{c.eventDate}</span>
                    <span className={`ml-auto font-mono text-[10px] font-semibold ${seismicMarketTag(c).color}`}>
                      {seismicMarketTag(c).label}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-[10px] leading-relaxed text-tos-muted">
                    {c.notes || c.region}
                    {c.fatalities > 0 && <span className="ml-1 text-rose-300/80">({c.fatalities} fatalities)</span>}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-tos-muted">
              {intel.providers.find((p) => p.id === "conflictEvents")?.description ?? "No conflict data yet."}
            </p>
          )}
        </GlassPanel>

        <GlassPanel className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-emerald-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                AXE Cyber Intel
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-tos-dim">{intel.cyber.length > 0 ? `${intel.cyber.length} signals` : ""}</span>
              <InlineStatus providers={intel.providers} id="cyberThreats" />
            </div>
          </div>
          {intel.cyber.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.cyber.slice(0, 8).map((t, i) => (
                <li
                  key={`${t.ip}-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-[#0a0a0d]/90 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold text-tos-text">{t.ip}</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-tos-dim">
                    {t.name || t.category}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-semibold uppercase ${
                      t.classification === "malicious" ? "text-rose-300" :
                      t.classification === "benign" ? "text-emerald-300" :
                      "text-amber-200/70"
                    }`}
                  >
                    {t.classification || "unknown"}
                  </span>
                  {t.tags.length > 0 && (
                    <span className="font-mono text-[10px] text-tos-dim">{t.tags[0]}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-tos-muted">
              {intel.providers.find((p) => p.id === "cyberThreats")?.description ?? "No cyber threat data yet."}
            </p>
          )}
        </GlassPanel>
      </div>

      {/* ─── CORRELATION ENGINE ─────────────────────────────────── */}
      <CorrelationEngine />
      <CorrelateButton symbol={symbol} />

      <div className="flex flex-wrap gap-2 px-1 text-[11px]">
        <Link
          href={chatQ(
            `[AXE · intel]\nGive me a smart-money read on ${symbol} right now: insider buys, congressional activity, dark-pool prints and unusual options flow. Be specific about names, sizes and timing.`,
          )}
          className="rounded-lg border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 font-semibold text-white/90 hover:bg-white/[0.08]"
        >
          Ask AXE about smart money
        </Link>
        <Link
          href={chatQ(
            `[AXE · intel]\nAnalyze all alt-data feeds: executive jets, military radar, emergency monitor, supply chain, energy flows, conflict events and cyber threats. Find any cross-feed correlations that could affect ${symbol} or broader markets.`,
          )}
          className="rounded-lg border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 font-semibold text-white/90 hover:bg-white/[0.08]"
        >
          Ask AXE about alt-data
        </Link>
        <Link
          href="/alerts"
          className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 font-semibold text-tos-muted hover:bg-white/[0.08]"
        >
          Create intel alert
        </Link>
      </div>

      <p className="px-1 text-[10px] leading-relaxed text-tos-dim">
        AXE Intel runs 13 feeds through the Supabase intel-proxy — smart money (insider, congress, dark pool, options, tide)
        and alt-data (corporate jets, military radar, emergency monitor, vessels, chokepoints, conflict, energy, cyber). AXE serializes requests and reuses cached snapshots.
        Nothing here is fabricated.
      </p>

      {/* AXE Intel AI — floating chat panel + FAB */}
      <IntelAiChat symbol={symbol} />
    </div>
  );
}

function ProviderBadges({
  providers,
  cache,
}: {
  providers: IntelProviderStatus[];
  cache: IntelSnapshot["cache"];
}) {
  const liveCount = providers.filter((p) => p.state === "live").length;
  const errorCount = providers.filter((p) => p.state === "error").length;
  const offCount = providers.filter((p) => p.state === "off").length;
  const degraded = errorCount > 0 || cache.state === "stale";
  const summary =
    cache.state === "fresh"
      ? `${liveCount}/${providers.length} ready`
      : cache.state === "stale"
        ? `${liveCount}/${providers.length} ready · cached ${cache.ageSeconds != null ? formatAge(cache.ageSeconds) : "snapshot"}`
        : "Feed warming";
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-tos-dim">Live feed health</span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            degraded
              ? "border-amber-400/25 bg-amber-400/[0.07] text-amber-100/90"
              : "border-white/[0.08] bg-white/[0.05] text-white/90"
          }`}
          title={cache.message}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${degraded ? "bg-amber-300/85" : "bg-emerald-300"}`} aria-hidden />
          {summary}
        </span>
        {offCount > 0 ? <span className="text-[10px] text-tos-dim">{offCount} optional off</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {providers.map((p) => {
          const tone =
            p.state === "live"
              ? "border-white/[0.10] bg-white/[0.05] text-white/90"
              : p.state === "error"
                ? "border-amber-400/25 bg-amber-400/[0.07] text-amber-100/90"
                : "border-white/12 bg-white/[0.04] text-tos-dim";
          return (
            <span
              key={p.id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone}`}
              title={p.description}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  p.state === "live" ? "bg-emerald-300" : p.state === "error" ? "bg-amber-300/85" : "bg-white/25"
                }`}
                aria-hidden
              />
              {intelHealthLabel(p.id)}
              {p.state === "live" ? "" : ` · ${p.state}`}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Market relevance tag for seismic/geo events */
function seismicMarketTag(c: { eventType: string; region: string; notes: string; fatalities: number; latitude: number | null; longitude: number | null }): { label: string; color: string } {
  const text = `${c.region} ${c.notes}`.toLowerCase();
  const lat = c.latitude ?? 0;
  const lon = c.longitude ?? 0;

  // Shipping chokepoint proximity
  const nearHormuz = lat > 24 && lat < 28 && lon > 54 && lon < 58;
  const nearSuez = lat > 28 && lat < 32 && lon > 31 && lon < 34;
  const nearTaiwan = lat > 21 && lat < 26 && lon > 118 && lon < 123;
  const nearMalacca = lat > -2 && lat < 6 && lon > 98 && lon < 106;
  const nearBabel = lat > 11 && lat < 14 && lon > 42 && lon < 44;
  const nearPanama = lat > 7 && lat < 10 && lon > -81 && lon < -78;

  if (nearHormuz || nearBabel) return { label: "Oil & shipping risk", color: "text-rose-300" };
  if (nearSuez) return { label: "Supply chain risk", color: "text-rose-300" };
  if (nearTaiwan) return { label: "Semiconductor risk", color: "text-rose-300" };
  if (nearMalacca) return { label: "Trade route risk", color: "text-amber-200" };
  if (nearPanama) return { label: "Shipping disruption", color: "text-amber-200" };

  // Energy infrastructure
  if (text.includes("lng") || text.includes("pipeline") || text.includes("refiner")) return { label: "Energy disruption", color: "text-rose-300" };
  if (text.includes("oil") || text.includes("petroleum") || text.includes("crude")) return { label: "Energy risk", color: "text-amber-200" };

  // Major storms
  if (c.eventType === "Severe Storms" || text.includes("tropical") || text.includes("hurricane") || text.includes("typhoon")) return { label: "Logistics risk", color: "text-amber-200" };

  // Volcanic / wildfire affecting major routes
  if ((c.eventType === "Wildfires" || c.eventType === "Volcanoes") && (text.includes("canada") || text.includes("california") || text.includes("texas") || text.includes("alaska"))) return { label: "Commodity risk", color: "text-amber-200/70" };

  // Conflict with fatalities
  if (c.fatalities > 10) return { label: "Geopolitical risk", color: "text-rose-300" };
  if (c.fatalities > 0) return { label: "Regional instability", color: "text-amber-200/70" };

  // Large earthquakes
  const magMatch = (c.notes + c.region).match(/M\s?(\d+\.?\d*)/i);
  const mag = magMatch ? parseFloat(magMatch[1]) : 0;
  if (mag >= 7) return { label: "Infrastructure risk", color: "text-rose-300" };
  if (mag >= 6) return { label: "Potential disruption", color: "text-amber-200/70" };

  return { label: "Low market impact", color: "text-tos-dim" };
}

function InlineStatus({ providers, id }: { providers: IntelProviderStatus[]; id: string }) {
  const p = providers.find((pv) => pv.id === id);
  if (!p) return null;
  const dot =
    p.state === "live" ? "bg-emerald-300" : p.state === "error" ? "bg-amber-300/85" : "bg-white/25";
  const text =
    p.state === "live" ? "live" : p.state === "error" ? "error" : "off";
  const textColor =
    p.state === "live" ? "text-emerald-300/80" : p.state === "error" ? "text-amber-300/80" : "text-tos-dim";
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider ${textColor}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  );
}

function intelHealthLabel(id: string): string {
  const labels: Record<string, string> = {
    marketTide: "AXE Intel Tide",
    insiderTrades: "AXE Insider Flow",
    senateTrades: "AXE Policy Flow",
    darkPoolPrints: "AXE Dark Pool",
    unusualOptions: "AXE Options Flow",
    corporateJets: "AXE Jet Tracker",
    militaryRadar: "AXE Military Radar",
    emergencyMonitor: "AXE Emergency Monitor",
    vesselTracking: "AXE Vessel Intel",
    conflictEvents: "AXE Seismic Events",
    energyFlows: "AXE Energy Flow",
    cyberThreats: "AXE Cyber Intel",
  };
  return labels[id] ?? "AXE Intel";
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "positive" | "negative" | "neutral";
}) {
  const tone =
    accent === "positive"
      ? "border-white/[0.10] bg-white/[0.05] text-white/90"
      : accent === "negative"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-100/95"
        : "border-white/12 bg-white/[0.04] text-tos-text";
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-75">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function formatMoneyM(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatMoneyShort(value: number): string {
  return formatMoneyM(value);
}

function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return "less than a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

type EnergyFlowItem = { seriesId: string; seriesName: string; period: string; value: number | null; unit: string };

function deduplicateEnergy(items: EnergyFlowItem[]): EnergyFlowItem[] {
  const seen = new Map<string, EnergyFlowItem>();
  for (const item of items) {
    if (!seen.has(item.seriesId)) seen.set(item.seriesId, item);
  }
  return Array.from(seen.values());
}

function formatEnergyValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "—";
  if (unit.includes("$")) return `$${value.toFixed(2)}`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(1);
}
