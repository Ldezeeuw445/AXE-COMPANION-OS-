import Link from "next/link";
import { Activity, BarChart3, Eye, Landmark, Target, TrendingUp } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { AxeContextToolbar, type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { listWatchlistItems } from "@/app/(app)/settings/actions";
import { loadIntelSnapshot, type IntelProviderStatus } from "@/lib/intel/intelClient";

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
  const cacheLabel =
    intel.cache.state === "stale"
      ? "Cached"
      : intel.hasLiveData
        ? "Live"
        : "Warming";

  const livePill = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
        intel.hasLiveData
          ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200/95"
          : "border-amber-400/25 bg-amber-400/[0.06] text-amber-200/90"
      }`}
      title={intel.cache.message}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${intel.hasLiveData ? "bg-cyan-300" : "bg-amber-300/80"}`}
        aria-hidden
      />
      {cacheLabel}
    </span>
  );

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
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-6">
      {/* Mobile top bar: AXE wordmark + pulse is the single live
          indicator now — see `AxeWordmarkLive`. We pass our provider
          counts and freshness through `LiveStatusReporter`. The
          provider grid below is the detail view. */}
      <AxeTopBarInjector
        title="Intel"
        subtitle={`${symbol} smart-money flow`}
        sections={toolbarSections}
      />
      <LiveStatusReporter
        liveCount={liveProviderCount}
        totalCount={intel.providers.length}
        freshestAgeSec={intel.cache.ageSeconds ?? null}
        label="Intel"
        allLiveOverride={intel.hasLiveData && !isStale ? true : intel.hasLiveData ? false : null}
      />
      <ScreenHeader
        title="Intel"
        subtitle={`Smart-money intelligence — Unusual Whales feeds filtered by ${symbol}.`}
        left={<Target className="h-6 w-6 text-cyan-400/85" aria-hidden />}
        right={
          <div className="flex items-center gap-2">
            {livePill}
            <span className="hidden md:inline-flex">
              <AxeContextToolbar
                title="Intel"
                subtitle={`${symbol} smart-money flow`}
                sections={toolbarSections}
              />
            </span>
          </div>
        }
      />

      <ProviderBadges providers={intel.providers} />

      {intel.cache.message ? (
        <GlassPanel className="p-3">
          <p className="text-xs leading-relaxed text-tos-muted">
            {intel.cache.message}
            {intel.cache.ageSeconds != null ? ` Last cached ${formatAge(intel.cache.ageSeconds)} ago.` : ""}
          </p>
        </GlassPanel>
      ) : null}

      {/* MARKET TIDE */}
      <GlassPanel className="p-4" glow="cyan">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-cyan-300/85" aria-hidden />
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
              Market tide
            </h2>
          </div>
          <span className="text-[10px] text-tos-dim">
            {intel.tide ? `Unusual Whales · ${isStale ? "cached" : "live"}` : "Feed warming"}
          </span>
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
              <Eye className="h-3.5 w-3.5 text-cyan-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                Insider transactions
              </h2>
            </div>
            <span className="text-[10px] text-tos-dim">
              {intel.insiders.length > 0 ? `${intel.insiders.length} latest` : "—"}
            </span>
          </div>
          {intel.insiders.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.insiders.slice(0, 10).map((row, i) => (
                <li
                  key={`${row.ticker}-${row.date}-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-black/25 px-3 py-2"
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
                      row.type === "BUY" ? "text-cyan-300" : "text-rose-300"
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
              <Landmark className="h-3.5 w-3.5 text-cyan-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                Congress
              </h2>
            </div>
            <span className="text-[10px] text-tos-dim">
              {intel.senate.length > 0 ? `${intel.senate.length} disclosures` : "—"}
            </span>
          </div>
          {intel.senate.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.senate.slice(0, 10).map((row, i) => (
                <li
                  key={`${row.ticker}-${row.politician}-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-black/25 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold text-tos-text">{row.ticker}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-tos-text" title={row.politician}>
                    {row.politician}
                    <span className="ml-1 text-[10px] text-tos-dim">· {row.chamber}</span>
                  </span>
                  <span
                    className={`font-mono text-[10px] font-semibold uppercase ${
                      row.direction === "BUY" ? "text-cyan-300" : "text-rose-300"
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
              <BarChart3 className="h-3.5 w-3.5 text-cyan-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                Dark pool prints
              </h2>
            </div>
            <span className="text-[10px] text-tos-dim">
              {intel.darkPool.length > 0 ? `Top ${Math.min(10, intel.darkPool.length)}` : "—"}
            </span>
          </div>
          {intel.darkPool.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.darkPool.slice(0, 10).map((row, i) => (
                <li
                  key={`${row.symbol}-${row.time ?? i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-black/25 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold text-tos-text">{row.symbol}</span>
                  <span className="font-mono text-[10px] text-tos-muted">${row.price.toFixed(2)}</span>
                  <span className="font-mono text-[10px] text-tos-muted">{row.size.toLocaleString()}</span>
                  {row.side ? (
                    <span
                      className={`font-mono text-[10px] font-semibold uppercase ${
                        row.side === "buy" ? "text-cyan-300" : row.side === "sell" ? "text-rose-300" : "text-tos-dim"
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
              <TrendingUp className="h-3.5 w-3.5 text-cyan-300/85" aria-hidden />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                Unusual options
              </h2>
            </div>
            <span className="text-[10px] text-tos-dim">
              {intel.options.length > 0 ? `Top ${Math.min(10, intel.options.length)} by premium` : "—"}
            </span>
          </div>
          {intel.options.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {intel.options.slice(0, 10).map((row, i) => (
                <li
                  key={`${row.symbol}-${row.exp}-${row.strike}-${i}`}
                  className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-black/25 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold text-tos-text">{row.symbol}</span>
                  <span className="font-mono text-[10px] text-tos-muted">${row.strike.toFixed(2)}</span>
                  <span className="font-mono text-[10px] text-tos-dim">{row.exp}</span>
                  <span
                    className={`ml-auto font-mono text-[10px] font-semibold uppercase ${
                      row.side === "CALL" ? "text-cyan-300" : "text-rose-300"
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

      <div className="flex flex-wrap gap-2 px-1 text-[11px]">
        <Link
          href={chatQ(
            `[AXE · intel]\nGive me a smart-money read on ${symbol} right now: insider buys, congressional activity, dark-pool prints and unusual options flow. Be specific about names, sizes and timing.`,
          )}
          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 font-semibold text-cyan-100/95 hover:bg-cyan-500/18"
        >
          Ask AXE about smart money
        </Link>
        <Link
          href="/alerts"
          className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 font-semibold text-tos-muted hover:bg-white/[0.08]"
        >
          Create intel alert
        </Link>
      </div>

      <p className="px-1 text-[10px] leading-relaxed text-tos-dim">
        Intel feeds are powered by Unusual Whales via the Supabase intel-proxy. AXE serializes requests and reuses cached
        snapshots so one app session cannot burn the weekly plan with repeated refreshes. Nothing here is fabricated.
      </p>
    </div>
  );
}

function ProviderBadges({ providers }: { providers: IntelProviderStatus[] }) {
  const liveCount = providers.filter((p) => p.state === "live").length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-tos-dim">Providers</span>
      {providers.map((p) => (
        <span
          key={p.id}
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            p.state === "live"
              ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200/95"
              : "border-white/12 bg-white/[0.04] text-tos-dim"
          }`}
          title={p.description}
        >
          {p.label}
          {p.state === "live" ? "" : " · off"}
        </span>
      ))}
      <span className="ml-auto text-[10px] text-tos-dim">
        {liveCount}/{providers.length} configured
      </span>
    </div>
  );
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
      ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100/95"
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
