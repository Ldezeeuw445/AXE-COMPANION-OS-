import Link from "next/link";
import { CalendarDays, Globe2, Newspaper, Sparkles } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { AxeContextToolbar, type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";
import { listWatchlistItems } from "@/app/(app)/settings/actions";
import { buildMarketContext } from "@/lib/market/marketContextService";
import type {
  EconomicEvent,
  MacroSnapshot,
  NewsItem,
  ProviderStatus,
} from "@/lib/market/marketTypes";

const DEFAULT_SYMBOL = "XAUUSD";

function chatQ(text: string): string {
  return `/chat?q=${encodeURIComponent(text)}`;
}

type PageProps = {
  searchParams: Promise<{ symbol?: string }>;
};

export default async function MarketContextPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const requestedSymbol = (sp.symbol ?? "").trim().toUpperCase();
  const watchlist = (await listWatchlistItems()).map((w) => w.symbol);
  const symbol = requestedSymbol || watchlist[0]?.toUpperCase() || DEFAULT_SYMBOL;

  const ctx = await buildMarketContext({ symbol, watchlist });

  const livePill = (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/95">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" aria-hidden />
      {ctx.hasLiveData ? "Live" : "Idle"}
    </span>
  );

  const toolbarSections: AxeToolbarSection[] = [
    {
      id: "ask-axe",
      title: "Ask AXE",
      items: [
        {
          id: "macro",
          label: "Macro risk today",
          description: `${symbol} — rates, DXY proxy, CPI/NFP map`,
          href: chatQ(
            `[AXE · macro]\nWalk me through today's macro risk on ${symbol}: rates, yields, DXY proxy and the gold/USD axis. Anchor it on my active pair.`,
          ),
        },
        {
          id: "news",
          label: "What moved price?",
          description: `${symbol} headlines → trading impact`,
          href: chatQ(
            `[AXE · news]\nSummarize the most market-moving headlines for ${symbol} today. Tie them back to my open positions if any.`,
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
          description: "Price, news, macro",
          href: `/alerts?symbol=${encodeURIComponent(symbol)}`,
        },
      ],
    },
  ];

  const hasFred = ctx.providers.find((p) => p.id === "fred")?.state === "live";
  // The provider label is derived from whatever actually returned items —
  // that's the most honest signal for the user. Falls back to Google News
  // (the no-key RSS source we use when no keyed provider is configured).
  const newsProviderLabel = (() => {
    if (ctx.news.length === 0) return null;
    const usedId = ctx.news[0]?.provider;
    if (usedId === "fmp") return "FMP Ultimate";
    if (usedId === "perigon") return "Perigon";
    if (usedId === "finnhub") return "Finnhub";
    if (usedId === "eodhd") return "EODHD";
    if (usedId === "demo") return "Google News";
    return null;
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-6">
      <AxeTopBarInjector
        title="Market"
        subtitle={`${symbol} context`}
        sections={toolbarSections}
        center={livePill}
      />
      <ScreenHeader
        title="Market context"
        subtitle={`Filtered by ${symbol}${ctx.symbols.length > 1 ? ` + ${ctx.symbols.length - 1} watch` : ""} — macro, news and calendar.`}
        left={<Globe2 className="h-6 w-6 text-cyan-400/85" aria-hidden />}
        right={
          <div className="flex items-center gap-2">
            {livePill}
            <span className="hidden md:inline-flex">
              <AxeContextToolbar
                title="Market"
                subtitle={`${symbol} context`}
                sections={toolbarSections}
              />
            </span>
          </div>
        }
      />

      <ProviderBadges providers={ctx.providers} />

      {ctx.symbols.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {ctx.symbols.map((s) => (
            <Link
              key={s}
              href={`/market?symbol=${encodeURIComponent(s)}`}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                s === symbol
                  ? "border-cyan-400/35 bg-cyan-500/15 text-cyan-200/95"
                  : "border-white/10 bg-white/[0.03] text-tos-muted hover:bg-white/[0.06]"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Macro */}
      <GlassPanel className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">Macro snapshot</h2>
          <span className="text-[10px] text-tos-dim">{hasFred ? "FRED · live" : "Configure FRED_API_KEY"}</span>
        </div>
        {ctx.macro && ctx.macro.points.length > 0 ? (
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {ctx.macro.points.map((p) => (
              <MacroPoint key={p.seriesId} point={p} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-tos-muted">
            {hasFred
              ? "FRED returned no observations for this symbol's series yet — try another symbol."
              : "Add FRED_API_KEY on Vercel to unlock yields, rates, CPI and USD-index context."}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <Link
            href={chatQ(
              `[AXE · macro]\nWalk me through today's macro risk on ${symbol}: rates, yields, DXY proxy and the gold/USD axis. Anchor it on my active pair.`,
            )}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 font-semibold text-cyan-100/95 hover:bg-cyan-500/18"
          >
            Ask AXE about macro
          </Link>
        </div>
      </GlassPanel>

      {/* Calendar */}
      <GlassPanel className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-cyan-300/85" aria-hidden />
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
              Upcoming events (5d)
            </h2>
          </div>
          <span className="text-[10px] text-tos-dim">
            {ctx.events.length > 0 ? `${ctx.events.length} events` : "Calendar inactive"}
          </span>
        </div>
        {ctx.events.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {ctx.events.slice(0, 8).map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-tos-muted">
            Configure FINNHUB_API_KEY (recommended) or FMP_API_KEY to load economic events with impact ratings.
          </p>
        )}
      </GlassPanel>

      {/* News */}
      <GlassPanel className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <Newspaper className="h-3.5 w-3.5 text-cyan-300/85" aria-hidden />
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">Headlines</h2>
          </div>
          <span className="text-[10px] text-tos-dim">
            {newsProviderLabel ? `${newsProviderLabel} · live` : "No news provider configured"}
          </span>
        </div>
        {ctx.news.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {ctx.news.slice(0, 8).map((n) => (
              <NewsRow key={n.id} item={n} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-tos-muted">
            No headlines came back for {symbol} just now. Add FMP / Perigon / Finnhub / EODHD keys for symbol-tagged
            premium feeds — Google News is used as a free fallback.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <Link
            href={chatQ(
              `[AXE · news]\nSummarize the most market-moving headlines for ${symbol} today. Tie them back to my open positions if any.`,
            )}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 font-semibold text-cyan-100/95 hover:bg-cyan-500/18"
          >
            <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
            Ask AXE about news
          </Link>
          <Link
            href="/alerts"
            className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 font-semibold text-tos-muted hover:bg-white/[0.08]"
          >
            Create news alert
          </Link>
        </div>
      </GlassPanel>

      <p className="px-1 text-[10px] leading-relaxed text-tos-dim">
        Market context blends FRED macro, your news provider and the economic calendar with your active pair, watchlist
        and open positions. Nothing here is fabricated — providers report their own state.
      </p>
    </div>
  );
}

function ProviderBadges({ providers }: { providers: ProviderStatus[] }) {
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

function MacroPoint({ point }: { point: MacroSnapshot["points"][number] }) {
  const formatted =
    point.value == null
      ? "—"
      : point.units === "%"
        ? `${point.value.toFixed(2)}%`
        : Math.abs(point.value) >= 1000
          ? point.value.toLocaleString()
          : point.value.toFixed(2);
  return (
    <li className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-tos-dim">{point.label}</span>
      <span className="font-mono text-sm text-tos-text">{formatted}</span>
      {point.observedAt ? (
        <span className="text-[9.5px] text-tos-dim/85">{point.observedAt}</span>
      ) : null}
    </li>
  );
}

function EventRow({ event }: { event: EconomicEvent }) {
  const ts = new Date(event.startsAt);
  const date = ts.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <li className="flex items-baseline gap-3 rounded-lg border border-white/[0.05] bg-black/25 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-tos-dim">{date}</span>
      <span className="min-w-0 flex-1 text-xs text-tos-text">
        <span className="font-medium">{event.title}</span>
        {event.currency ? (
          <span className="ml-2 font-mono text-[10px] text-tos-dim">{event.currency}</span>
        ) : null}
      </span>
      <ImpactBadge impact={event.impact} />
    </li>
  );
}

function ImpactBadge({ impact }: { impact: EconomicEvent["impact"] }) {
  const map: Record<EconomicEvent["impact"], { label: string; className: string }> = {
    high: { label: "High", className: "border-rose-400/35 bg-rose-400/10 text-rose-200/95" },
    medium: { label: "Med", className: "border-amber-400/30 bg-amber-400/10 text-amber-200/95" },
    low: { label: "Low", className: "border-white/12 bg-white/[0.04] text-tos-dim" },
    unknown: { label: "·", className: "border-white/12 bg-white/[0.04] text-tos-dim" },
  };
  const v = map[impact];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${v.className}`}>
      {v.label}
    </span>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  const date = item.publishedAt
    ? new Date(item.publishedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex flex-col gap-0.5 rounded-lg border border-white/[0.05] bg-black/25 px-3 py-2 hover:border-cyan-400/25"
      >
        <span className="text-[12px] font-medium text-tos-text group-hover:text-cyan-100/95">{item.title}</span>
        <span className="flex flex-wrap items-baseline gap-2 text-[10px] text-tos-dim">
          <span>{item.source}</span>
          {date ? <span>· {date}</span> : null}
          {item.symbols && item.symbols.length > 0 ? (
            <span className="font-mono">· {item.symbols.slice(0, 3).join(", ")}</span>
          ) : null}
          {item.sentiment != null ? (
            <Badge variant={item.sentiment > 0.1 ? "long" : item.sentiment < -0.1 ? "short" : "neutral"}>
              {item.sentiment > 0.1 ? "Bullish" : item.sentiment < -0.1 ? "Bearish" : "Neutral"}
            </Badge>
          ) : null}
        </span>
      </a>
    </li>
  );
}
