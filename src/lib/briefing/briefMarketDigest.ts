import type { MarketContext } from "@/lib/market/marketTypes";
import {
  formatEventTime,
  isEventToday,
  isJunkBriefNews,
  isTraderRelevantNews,
  scoreCalendarEventForBrief,
} from "@/lib/briefing/briefNewsQuality";

/** Headlines older than this never reach a brief (the provider chain may fall back to 14-day-old news). */
export const BRIEF_NEWS_MAX_AGE_HOURS = { daily: 72, weekly: 7 * 24 } as const;

function dated(iso: string, timezone: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "undated";
  return d.toLocaleString("en-GB", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Trader-focused digest for the brief prompt — dated events first, then dated, recent headlines only. */
export function summarizeBriefMarketContext(
  ctx: MarketContext,
  timezone: string,
  opts: { weekly?: boolean; now?: Date } = {},
): string {
  const now = opts.now ?? new Date();
  const parts: string[] = [];
  parts.push(`Generated: ${dated(now.toISOString(), timezone)} (${timezone}).`);
  parts.push(`Active symbol: ${ctx.symbol}.`);
  if (ctx.symbols.length > 1) parts.push(`Watchlist: ${ctx.symbols.join(", ")}.`);

  if (opts.weekly) {
    const weekEnd = now.getTime() + 7 * 24 * 60 * 60 * 1000;
    const weekEvents = ctx.events
      .filter((e) => {
        const t = Date.parse(e.startsAt);
        return Number.isFinite(t) && t >= now.getTime() - 60 * 60 * 1000 && t <= weekEnd && e.impact !== "low";
      })
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .slice(0, 10);
    parts.push(
      weekEvents.length > 0
        ? `This week's economic calendar (real, dated — the only events you may name):\n${weekEvents
            .map((e) => `- ${dated(e.startsAt, timezone)} · ${e.currency ?? e.country ?? "Global"} · ${e.impact.toUpperCase()} · ${e.title}`)
            .join("\n")}`
        : "This week's economic calendar: no medium or high impact events in the feed — do not name any.",
    );
  }

  const todayEvents = ctx.events
    .filter((e) => !opts.weekly && isEventToday(e.startsAt, timezone, now))
    .sort((a, b) => scoreCalendarEventForBrief(b) - scoreCalendarEventForBrief(a));

  if (todayEvents.length > 0) {
    const lines = todayEvents.slice(0, 6).map((e) => {
      const when = formatEventTime(e.startsAt, timezone);
      const cur = e.currency ?? e.country ?? "Global";
      return `- ${when} · ${cur} · ${e.impact.toUpperCase()} impact · ${e.title}`;
    });
    parts.push(`Today's economic calendar (use for NEWS / session planning):\n${lines.join("\n")}`);
  } else if (!opts.weekly) {
    parts.push("Today's economic calendar: no major scheduled releases in the feed.");
  }

  const upcomingHigh = ctx.events
    .filter((e) => !opts.weekly && !isEventToday(e.startsAt, timezone, now) && Date.parse(e.startsAt) > now.getTime() && e.impact === "high")
    .slice(0, 3);
  if (upcomingHigh.length > 0) {
    const lines = upcomingHigh.map(
      (e) =>
        `- ${formatEventTime(e.startsAt, timezone)} · ${e.currency ?? e.country ?? "?"} · ${e.title}`,
    );
    parts.push(`Upcoming high-impact (next sessions):\n${lines.join("\n")}`);
  }

  const maxAgeMs = (opts.weekly ? BRIEF_NEWS_MAX_AGE_HOURS.weekly : BRIEF_NEWS_MAX_AGE_HOURS.daily) * 60 * 60 * 1000;
  const headlines = ctx.news
    .filter((n) => {
      const t = Date.parse(n.publishedAt);
      return Number.isFinite(t) && now.getTime() - t <= maxAgeMs && t <= now.getTime() + 5 * 60 * 1000;
    })
    .filter((n) => isTraderRelevantNews(n.title, n.summary) && !isJunkBriefNews(n.title, n.summary))
    .slice(0, opts.weekly ? 5 : 3);
  if (headlines.length > 0) {
    const lines = headlines.map((n) => `- ${dated(n.publishedAt, timezone)} · ${n.title} (${n.source})`);
    parts.push(`Relevant headlines (real, dated — summarize in plain language, do NOT paste URLs, do not add news that is not here):\n${lines.join("\n")}`);
  } else {
    parts.push(`Headlines: none from the last ${opts.weekly ? "7 days" : "72 hours"} in the feed — do not mention any news story.`);
  }

  if (ctx.macro?.points.length) {
    const macroLine = ctx.macro.points
      .filter((p) => p.value != null)
      .slice(0, 4)
      .map((p) => `${p.label} ${p.value}${p.units ?? ""}`)
      .join(" · ");
    if (macroLine) parts.push(`Macro: ${macroLine}`);
  }

  return parts.join("\n\n");
}
