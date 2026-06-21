import { useEffect, useMemo, useState } from 'react';
import { Activity, FlaskConical, Gauge, TriangleAlert } from 'lucide-react';
import { getTradingAdapter } from '@/lib/tradingAdapterSingleton';
import type { DashboardData, HistoricalMetrics } from '@/engine/types/dashboard';
import { ENGINE_PROXY_ACTIONS, INTEL_PROXY_ACTIONS, PAGE_DATA_MATRIX } from '@/lib/dataEngineMatrices';
import { getLegacyAdapterFeedFlags, runEngineOpsLiveProof, type EngineOpsLiveProofRow } from '@/lib/engineAdapter';

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1">
      <span className="text-[10px] text-white/40">{label}</span>
      <span className="text-[10px] font-medium text-white/70 tabular-nums">{value}</span>
    </div>
  );
}

function fmtPct(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

function fmtNum(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return String(Math.round(n));
}

export default function EngineOps() {
  const adapter = useMemo(() => getTradingAdapter(), []);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [hist, setHist] = useState<HistoricalMetrics | null>(null);
  const [status, setStatus] = useState<{ status: 'healthy' | 'degraded' | 'critical'; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedFlags, setFeedFlags] = useState(() => getLegacyAdapterFeedFlags());
  const [proofRows, setProofRows] = useState<EngineOpsLiveProofRow[] | null>(null);
  const [proofRunning, setProofRunning] = useState(false);
  const [proofGlobalErr, setProofGlobalErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setError(null);
      try {
        const [d, h, s] = await Promise.all([
          adapter.getDashboard(),
          adapter.getMetricsHistory('24H'),
          adapter.getEngineStatus(),
        ]);
        if (!alive) return;
        setDash(d);
        setHist(h);
        setStatus(s);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [adapter]);

  useEffect(() => {
    const id = window.setInterval(() => setFeedFlags(getLegacyAdapterFeedFlags()), 4000);
    return () => window.clearInterval(id);
  }, []);

  const missingEngineSecrets =
    dash?.credentialSlots?.filter((s) => !s.configured).map((s) => `${s.domain}→${s.supabaseSecretNames.slice(0, 2).join(',')}`) ?? [];

  const slot = (domain: string) => dash?.credentialSlots?.find((s) => s.domain === domain) ?? null;
  const provider = (prefix: string) => (dash?.providers ?? []).find((p) => p.id.startsWith(prefix)) ?? null;

  const openskySlot = slot('opensky');
  const aisstreamSlot = slot('aisstream');
  const openskyProvider = provider('opensky_');
  const aisstreamProvider = provider('aisstream_');
  const jetsFallbacks = dash?.fallbacksByDomain?.intel_jets ?? 0;
  const vesselsFallbacks = dash?.fallbacksByDomain?.intel_vessels ?? 0;

  const intelStatus = (cfg: boolean | undefined, p: typeof openskyProvider) => {
    if (cfg === false) return 'missing secrets';
    if (!p) return 'connector missing';
    if (p.lastSuccess !== 'never') return 'live';
    if (p.lastError !== 'never') return 'fallback';
    return 'idle';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Gauge size={14} className="text-cyan-400" />
          <span className="text-[10px] text-white/40 px-1.5 py-0.5 bg-white/5 rounded">ENGINE</span>
          <span className="text-[10px] text-white/30">Ops / Health / Credits</span>
        </div>
        {status && (
          <div className="flex items-center gap-2">
            <span
              className={`text-[9px] font-medium px-2 py-0.5 rounded ${
                status.status === 'healthy'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : status.status === 'degraded'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {status.status.toUpperCase()}
            </span>
            <span className="text-[10px] text-white/35">{status.message}</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <div className="tos-card rounded-lg p-3 border border-red-500/20 bg-red-500/5 flex items-center gap-2">
            <TriangleAlert size={14} className="text-red-400" />
            <div className="text-[11px] text-red-300">
              {error}
              <div className="text-[10px] text-red-300/70 mt-1">
                Tip: `VITE_USE_ENGINE_EDGE=true` requires deployed `engine-proxy`. Public reads use the anon key as Bearer when there is no session.
              </div>
            </div>
          </div>
        )}

        <div className="tos-card rounded-lg p-3 border border-amber-500/15 bg-amber-500/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <FlaskConical size={12} className="text-amber-400/90" />
              <span className="tos-block-title text-amber-200/90">Live Data Proof</span>
              <span className="text-[9px] text-white/30">debug · zelfde sessie als app</span>
            </div>
            <button
              type="button"
              disabled={proofRunning}
              onClick={async () => {
                setProofRunning(true);
                setProofGlobalErr(null);
                try {
                  setProofRows(await runEngineOpsLiveProof());
                } catch (e) {
                  setProofGlobalErr(e instanceof Error ? e.message : String(e));
                  setProofRows(null);
                } finally {
                  setProofRunning(false);
                }
              }}
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-200 hover:bg-amber-500/15 disabled:opacity-50 disabled:pointer-events-none"
            >
              {proofRunning ? 'Running…' : 'Run Proof'}
            </button>
          </div>
          {proofGlobalErr ? (
            <div className="text-[10px] text-red-300/90 font-mono break-words">{proofGlobalErr}</div>
          ) : null}
          {proofRows && proofRows.length > 0 ? (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left text-[9px] text-white/50">
                <thead>
                  <tr className="border-b border-white/[0.06] text-white/35">
                    <th className="py-1.5 pr-2 font-medium">Proxy</th>
                    <th className="py-1.5 pr-2 font-medium">Action</th>
                    <th className="py-1.5 pr-2 font-medium">Status</th>
                    <th className="py-1.5 pr-2 font-medium">ok</th>
                    <th className="py-1.5 pr-2 font-medium">Count</th>
                    <th className="py-1.5 pr-2 font-medium">Source</th>
                    <th className="py-1.5 pr-2 font-medium max-w-[240px]">Trace / metrics</th>
                    <th className="py-1.5 font-medium">Error (≤200)</th>
                  </tr>
                </thead>
                <tbody>
                  {proofRows.map((r, idx) => (
                    <tr key={`${r.proxy}-${r.action}-${idx}`} className="border-b border-white/[0.04] align-top">
                      <td className="py-1 pr-2 font-mono text-white/55">{r.proxy}</td>
                      <td className="py-1 pr-2 font-mono text-white/45">{r.action}</td>
                      <td className="py-1 pr-2">
                        <span
                          className={
                            r.status === 'live'
                              ? 'text-emerald-400/90'
                              : r.status === 'empty'
                                ? 'text-amber-300/80'
                                : 'text-red-300/90'
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-1 pr-2 font-mono">{r.ok ? 'true' : 'false'}</td>
                      <td className="py-1 pr-2 tabular-nums">{typeof r.count === 'number' ? r.count : '—'}</td>
                      <td className="py-1 pr-2 text-white/40">{r.providerOrSource ?? '—'}</td>
                      <td className="py-1 pr-2 align-top max-w-[240px]">
                        {r.chartTrace ? (
                          <pre className="font-mono text-[7px] leading-snug text-white/30 whitespace-pre-wrap break-all">
                            {JSON.stringify(
                              {
                                providersAttempted: r.chartTrace.providersAttempted,
                                providerErrors: r.chartTrace.providerErrors,
                                configured: r.chartTrace.configured,
                                providerSymbol: r.chartTrace.providerSymbol,
                                finalProviderUsed: r.chartTrace.finalProviderUsed,
                                candleCount: r.chartTrace.candleCount,
                                notes: r.chartTrace.notes,
                              },
                              null,
                              0,
                            )}
                          </pre>
                        ) : r.intelJetsMetrics ? (
                          <pre className="font-mono text-[7px] leading-snug text-white/30 whitespace-pre-wrap break-all">
                            {JSON.stringify(r.intelJetsMetrics, null, 0)}
                          </pre>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </td>
                      <td className="py-1 font-mono text-red-300/80 break-words max-w-[200px]">{r.errorSnippet ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !proofRunning && !proofGlobalErr ? (
            <div className="text-[10px] text-white/25 mt-1">Klik Run Proof om engine-proxy + intel-proxy met je huidige login te testen.</div>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="tos-card rounded-lg p-3">
            <div className="tos-block-title mb-2 flex items-center gap-2">
              <Activity size={12} className="text-cyan-400" /> Overview
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill label="Edge" value={import.meta.env.VITE_USE_ENGINE_EDGE === 'true' ? 'ON' : 'OFF'} />
              <Pill label="History" value={hist ? '24H' : '—'} />
              <Pill label="Providers" value={dash ? `${dash.overview.activeProviders}/${dash.overview.totalProviders}` : '—'} />
              <Pill label="Cooldown" value={dash ? String(dash.overview.providersInCooldown) : '—'} />
              <Pill label="Cache hit" value={dash ? fmtPct(dash.overview.cacheHitRate) : '—'} />
              <Pill label="Savings" value={dash ? fmtPct(dash.overview.creditSavingsRate) : '—'} />
            </div>
          </div>

          <div className="tos-card rounded-lg p-3">
            <div className="tos-block-title mb-2">Credits</div>
            <div className="flex flex-wrap gap-2">
              <Pill label="Used" value={dash ? fmtNum(dash.overview.totalCreditsUsed) : '—'} />
              <Pill label="Avail" value={dash ? fmtNum(dash.overview.totalCreditsAvailable) : '—'} />
              <Pill label="Util" value={dash ? `${Math.round(dash.overview.overallUtilization)}%` : '—'} />
            </div>
            <div className="text-[9px] text-white/25 mt-1">Costs are “costUnits” heuristics per endpoint.</div>
          </div>

          <div className="tos-card rounded-lg p-3">
            <div className="tos-block-title mb-2">Efficiency</div>
            <div className="flex flex-wrap gap-2">
              <Pill label="Requests" value={dash ? fmtNum(dash.efficiency.totalRequests) : '—'} />
              <Pill label="API calls" value={dash ? fmtNum(dash.efficiency.realApiCalls) : '—'} />
              <Pill label="Cache hits" value={dash ? fmtNum(dash.efficiency.cacheHits) : '—'} />
              <Pill label="Saved" value={dash ? fmtNum(dash.efficiency.creditsSaved) : '—'} />
              <Pill label="Fallbacks" value={dash ? fmtNum(dash.efficiency.fallbacksUsed) : '—'} />
            </div>
            <div className="text-[9px] text-white/25 mt-2 space-y-0.5">
              <div>
                <span className="text-white/35">engine-proxy actions:</span>{' '}
                {ENGINE_PROXY_ACTIONS.join(', ')}
              </div>
              <div>
                <span className="text-white/35">intel-proxy actions:</span> {INTEL_PROXY_ACTIONS.join(', ')}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="tos-card rounded-lg p-3">
            <div className="tos-block-title mb-2">Cache</div>
            <div className="flex flex-wrap gap-2">
              <Pill label="Size" value={dash ? `${dash.cache.size}/${dash.cache.maxSize}` : '—'} />
              <Pill label="Hit rate" value={dash ? fmtPct(dash.cache.hitRate) : '—'} />
              <Pill label="Hits" value={dash ? fmtNum(dash.cache.hits) : '—'} />
              <Pill label="Misses" value={dash ? fmtNum(dash.cache.misses) : '—'} />
              <Pill label="Stale" value={dash ? fmtNum(dash.cache.staleServes) : '—'} />
              <Pill label="Evict" value={dash ? fmtNum(dash.cache.evictions) : '—'} />
            </div>
          </div>
          <div className="tos-card rounded-lg p-3">
            <div className="tos-block-title mb-2">Dedup / inflight</div>
            <div className="flex flex-wrap gap-2">
              <Pill label="Active" value={dash ? fmtNum(dash.inflight.activeRequests) : '—'} />
              <Pill label="Dedupes" value={dash ? fmtNum(dash.inflight.totalDedupes) : '—'} />
              <Pill label="Latency" value={dash ? `${fmtNum(dash.efficiency.avgLatencyMs)}ms` : '—'} />
            </div>
          </div>
        </div>

        <div className="tos-card rounded-lg p-3">
          <div className="tos-block-title mb-2">Intel connectors (proof)</div>
          <div className="flex flex-wrap gap-2">
            <Pill label="OpenSky configured" value={openskySlot ? (openskySlot.configured ? 'yes' : 'no') : '—'} />
            <Pill label="AISStream configured" value={aisstreamSlot ? (aisstreamSlot.configured ? 'yes' : 'no') : '—'} />
            <Pill label="Jets status" value={intelStatus(openskySlot?.configured, openskyProvider)} />
            <Pill label="Vessels status" value={intelStatus(aisstreamSlot?.configured, aisstreamProvider)} />
            <Pill label="Jets fallbacks" value={String(jetsFallbacks)} />
            <Pill label="Vessels fallbacks" value={String(vesselsFallbacks)} />
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-2">
              <div className="text-[10px] text-white/40">Corporate jets (OpenSky)</div>
              <div className="mt-1 text-[10px] text-white/55">
                last success: <span className="font-mono text-white/70">{openskyProvider?.lastSuccess ?? '—'}</span>
              </div>
              <div className="text-[10px] text-white/55">
                last error: <span className="font-mono text-white/60">{openskyProvider?.lastError ?? '—'}</span>
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-2">
              <div className="text-[10px] text-white/40">Vessels (AISStream)</div>
              <div className="mt-1 text-[10px] text-white/55">
                last success: <span className="font-mono text-white/70">{aisstreamProvider?.lastSuccess ?? '—'}</span>
              </div>
              <div className="text-[10px] text-white/55">
                last error: <span className="font-mono text-white/60">{aisstreamProvider?.lastError ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>

        {dash?.recommendations?.length ? (
          <div className="tos-card rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-white/5">
              <span className="tos-block-title">RECOMMENDATIONS</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {dash.recommendations.map((r, idx) => (
                <div key={`${r.message}_${idx}`} className="px-3 py-2 flex items-start gap-2">
                  <span
                    className={`mt-0.5 text-[9px] px-1.5 py-0.5 rounded border ${
                      r.priority === 'critical'
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : r.priority === 'warning'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-white/5 text-white/45 border-white/10'
                    }`}
                  >
                    {r.priority.toUpperCase()}
                  </span>
                  <div className="text-[10px] text-white/55">
                    {r.message}
                    {r.action ? <div className="text-[9px] text-white/30 mt-1">{r.action}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="tos-card rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5">
            <span className="tos-block-title">PROVIDERS</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {(dash?.providers ?? []).map((p) => (
              <div key={p.id} className="px-3 py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono text-white/70">{p.id}</span>
                  <span className="text-[9px] text-white/30">{p.provider}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded border ${
                      p.isHealthy ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}
                  >
                    {p.isHealthy ? 'HEALTHY' : 'UNHEALTHY'}
                  </span>
                  {p.isInCooldown ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      COOLDOWN{typeof p.cooldownRemainingSec === 'number' ? ` ${Math.max(0, Math.round(p.cooldownRemainingSec))}s` : ''}
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      OK
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[9px] text-white/30 tabular-nums">lat {p.avgLatencyMs}ms</span>
                  <span className="text-[9px] text-white/30 tabular-nums">q {p.dataQuality}</span>
                  <span className="text-[9px] text-white/30 tabular-nums">used {p.usedToday}/{p.dailyLimit}</span>
                </div>
                {p.lastError && p.lastError !== 'never' ? (
                  <div className="w-full text-[9px] text-red-300/80 break-words">last: {p.lastError}</div>
                ) : null}
              </div>
            ))}
            {dash && (dash.providers?.length ?? 0) === 0 && (
              <div className="px-3 py-3 text-[10px] text-white/30">No provider stats yet — trigger some requests (news/macro/chart/scanner).</div>
            )}
          </div>
        </div>

        {dash?.credentialSlots?.length ? (
          <div className="tos-card rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between gap-2">
              <span className="tos-block-title">CREDENTIAL SLOTS (engine boot)</span>
              <span className="text-[9px] text-white/30">configured = non-empty key list</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {dash.credentialSlots.map((s) => (
                <div key={s.domain} className="px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-white/70">{s.domain}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded border ${
                      s.configured ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}
                  >
                    {s.configured ? 'CONFIGURED' : 'MISSING'}
                  </span>
                  <span className="text-[9px] text-white/25 text-right flex-1 truncate" title={s.supabaseSecretNames.join(' · ')}>
                    {s.supabaseSecretNames.join(' · ') || '—'}
                  </span>
                </div>
              ))}
            </div>
            {missingEngineSecrets.length > 0 ? (
              <div className="px-3 py-2 border-t border-red-500/15 bg-red-500/5 text-[10px] text-red-200/90">
                Missing keys (set on engine-proxy): {missingEngineSecrets.join(' | ')}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="tos-card rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5">
            <span className="tos-block-title">LEGACY ADAPTER FLAGS (last successful engine/intel fetch)</span>
          </div>
          <div className="px-3 py-2 flex flex-wrap gap-2">
            <Pill label="macro" value={feedFlags.macroFeedLive ? 'LIVE' : ''} />
            <Pill label="news" value={feedFlags.newsFeedLive ? 'LIVE' : ''} />
            <Pill label="intel.jets" value={feedFlags.intelFeeds.corporateJets ? 'LIVE' : ''} />
            <Pill label="intel.vessels" value={feedFlags.intelFeeds.vesselStream ? 'LIVE' : ''} />
            <Pill label="intel.insiders" value={feedFlags.intelFeeds.insiderTrades ? 'LIVE' : ''} />
            <Pill label="intel.whales" value={feedFlags.intelFeeds.whaleTransactions ? 'LIVE' : ''} />
            <Pill label="WS URL set" value={feedFlags.viteLiveEngineWsConfigured ? 'yes' : 'no'} />
            <Pill label="terminal API set" value={feedFlags.viteTradingTerminalApiConfigured ? 'yes' : 'no'} />
          </div>
        </div>

        <div className="tos-card rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5">
            <span className="tos-block-title">PAGE → DATA (static matrix)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[9px] text-white/50">
              <thead>
                <tr className="border-b border-white/[0.06] text-white/35">
                  <th className="px-2 py-1.5 font-medium">Page</th>
                  <th className="px-2 py-1.5 font-medium">Adapter</th>
                  <th className="px-2 py-1.5 font-medium">Mode</th>
                  <th className="px-2 py-1.5 font-medium">engine-proxy</th>
                  <th className="px-2 py-1.5 font-medium">intel-proxy</th>
                  <th className="px-2 py-1.5 font-medium">Blocker</th>
                </tr>
              </thead>
              <tbody>
                {PAGE_DATA_MATRIX.map((row) => (
                  <tr key={row.page} className="border-b border-white/[0.04] align-top">
                    <td className="px-2 py-1 text-white/70">{row.page}</td>
                    <td className="px-2 py-1 font-mono text-white/45">{row.primaryAdapter}</td>
                    <td className="px-2 py-1">{row.mode}</td>
                    <td className="px-2 py-1 text-white/40">{row.engineProxy ?? '—'}</td>
                    <td className="px-2 py-1 text-white/40">{row.intelProxy ?? '—'}</td>
                    <td className="px-2 py-1 text-white/35">{row.blocker ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

