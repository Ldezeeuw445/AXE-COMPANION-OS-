import type { MarketContext } from "@/lib/market/marketTypes";
import type { BriefHighlight, BriefNewsCard } from "@/lib/briefing/briefBodyFormat";
import {
  formatEventTime,
  isEventToday,
  isTraderRelevantNews,
  isUsableBriefImage,
  scoreCalendarEventForBrief,
  scoreNewsForBrief,
} from "@/lib/briefing/briefNewsQuality";

export type BriefEventChip = {
  type: "event";
  title: string;
  time: string;
  impact: string;
  currency?: string;
};

/** At most one visual news card (real image only) + today's key calendar events as chips. */
export function buildBriefHighlights(
  ctx: MarketContext,
  timezone: string,
  pairSymbols: string[],
): BriefHighlight[] {
  const highlights: BriefHighlight[] = pairSymbols.map((p) => ({ pair: p }));

  const todayEvents = ctx.events
    .filter((e) => isEventToday(e.startsAt, timezone))
    .sort((a, b) => scoreCalendarEventForBrief(b) - scoreCalendarEventForBrief(a))
    .slice(0, 4);

  for (const ev of todayEvents) {
    highlights.push({
      type: "event",
      title: ev.title.trim(),
      time: formatEventTime(ev.startsAt, timezone),
      impact: ev.impact,
      currency: ev.currency ?? ev.country ?? undefined,
    });
  }

  const bestNews = ctx.news
    .filter((n) => isTraderRelevantNews(n.title, n.summary))
    .sort((a, b) => scoreNewsForBrief(b) - scoreNewsForBrief(a))
    .find((n) => isUsableBriefImage(n.imageUrl) && scoreNewsForBrief(n) >= 30);

  if (bestNews) {
    const card: BriefNewsCard = {
      type: "news",
      title: bestNews.title.trim(),
      summary: bestNews.summary?.trim().slice(0, 160) ?? null,
      imageUrl: bestNews.imageUrl!.trim(),
      source: bestNews.source,
      breaking: scoreNewsForBrief(bestNews) >= 50,
    };
    highlights.push(card);
  }

  return highlights;
}

/** @deprecated use buildBriefHighlights */
export function buildBriefNewsCards(ctx: MarketContext, _limit = 1): BriefNewsCard[] {
  return buildBriefHighlights(ctx, "Europe/Amsterdam", [])
    .filter((h): h is BriefNewsCard => h.type === "news")
    .slice(0, 1);
}
