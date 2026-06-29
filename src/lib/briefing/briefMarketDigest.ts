import type { MarketContext } from "@/lib/market/marketTypes";
import {
  formatEventTime,
  isEventToday,
  isJunkBriefNews,
  isTraderRelevantNews,
  scoreCalendarEventForBrief,
} from "@/lib/briefing/briefNewsQuality";

/** Trader-focused digest for the morning brief prompt — events first, filtered headlines. */
export function summarizeBriefMarketContext(ctx: MarketContext, timezone: string): string {
  const parts: string[] = [];
  parts.push(`Active symbol: ${ctx.symbol}.`);
  if (ctx.symbols.length > 1) parts.push(`Watchlist: ${ctx.symbols.join(", ")}.`);

  const todayEvents = ctx.events
    .filter((e) => isEventToday(e.startsAt, timezone))
    .sort((a, b) => scoreCalendarEventForBrief(b) - scoreCalendarEventForBrief(a));

  if (todayEvents.length > 0) {
    const lines = todayEvents.slice(0, 6).map((e) => {
      const when = formatEventTime(e.startsAt, timezone);
      const cur = e.currency ?? e.country ?? "Global";
      return `- ${when} · ${cur} · ${e.impact.toUpperCase()} impact · ${e.title}`;
    });
    parts.push(`Today's economic calendar (use for NEWS / session planning):\n${lines.join("\n")}`);
  } else {
    parts.push("Today's economic calendar: no major scheduled releases in the feed.");
  }

  const upcomingHigh = ctx.events
    .filter((e) => !isEventToday(e.startsAt, timezone) && e.impact === "high")
    .slice(0, 3);
  if (upcomingHigh.length > 0) {
    const lines = upcomingHigh.map(
      (e) =>
        `- ${formatEventTime(e.startsAt, timezone)} · ${e.currency ?? e.country ?? "?"} · ${e.title}`,
    );
    parts.push(`Upcoming high-impact (next sessions):\n${lines.join("\n")}`);
  }

  const headlines = ctx.news
    .filter((n) => isTraderRelevantNews(n.title, n.summary) && !isJunkBriefNews(n.title, n.summary))
    .slice(0, 3);
  if (headlines.length > 0) {
    const lines = headlines.map((n) => `- ${n.title} (${n.source})`);
    parts.push(`Relevant headlines (summarize in plain language — do NOT paste URLs):\n${lines.join("\n")}`);
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
