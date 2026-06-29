import type { EconomicEvent, NewsItem } from "@/lib/market/marketTypes";
import { isBreakingNewsText } from "@/lib/briefing/briefBodyFormat";

/** Filings, PR spam and other noise that isn't useful in a morning brief. */
const JUNK_NEWS_RE =
  /\b(form\s*8|ordinary shares|sec filing|disclosure of|proxy statement|fund advisors|price target|analyst (?:rating|upgrade|downgrade)|opens (?:a )?public|schedule\s*13|insider (?:buy|sell)|quarterly results announcement)\b/i;

const TRADER_RELEVANT_RE =
  /\b(fed|fomc|ecb|boe|boj|rate (?:cut|hike|decision)|cpi|nfp|payroll|gdp|pmi|ism|inflation|jobs report|unemployment|tariff|trump|war|geopolit|sanction|earnings|opec|oil|gold|bitcoin|crypto|recession|default|breaking)\b/i;

/** Image hosts that usually render inline in the brief (skip broken PR wire icons). */
const TRUSTED_IMAGE_HOST_RE =
  /(polygon\.io|finnhub|perigon|cloudfront|twimg|twitter|pbs\.twimg|reuters|bloomberg|ft\.com|wsj|nytimes|cdn\.)/i;

export function isJunkBriefNews(title: string, summary?: string | null): boolean {
  const text = `${title} ${summary ?? ""}`;
  return JUNK_NEWS_RE.test(text);
}

export function isTraderRelevantNews(title: string, summary?: string | null): boolean {
  const text = `${title} ${summary ?? ""}`;
  if (isJunkBriefNews(title, summary)) return false;
  return isBreakingNewsText(text) || TRADER_RELEVANT_RE.test(text);
}

export function isUsableBriefImage(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return false;
    const hostPath = `${u.hostname}${u.pathname}`;
    if (/unsplash|placeholder|globenewswire|1x1|pixel|spacer|favicon/i.test(hostPath)) return false;
    return TRUSTED_IMAGE_HOST_RE.test(hostPath) || u.pathname.match(/\.(jpg|jpeg|png|webp)(\?|$)/i) != null;
  } catch {
    return false;
  }
}

export function scoreNewsForBrief(item: NewsItem): number {
  if (isJunkBriefNews(item.title, item.summary)) return -100;
  let score = 0;
  if (isBreakingNewsText(`${item.title} ${item.summary ?? ""}`)) score += 50;
  if (TRADER_RELEVANT_RE.test(`${item.title} ${item.summary ?? ""}`)) score += 30;
  if (isUsableBriefImage(item.imageUrl)) score += 40;
  const ageH = (Date.now() - new Date(item.publishedAt).getTime()) / 3600_000;
  if (ageH < 6) score += 15;
  else if (ageH < 24) score += 8;
  else if (ageH > 72) score -= 20;
  return score;
}

export function scoreCalendarEventForBrief(ev: EconomicEvent): number {
  let score = 0;
  if (ev.impact === "high") score += 40;
  else if (ev.impact === "medium") score += 15;
  if (TRADER_RELEVANT_RE.test(ev.title)) score += 25;
  if (isBreakingNewsText(ev.title)) score += 20;
  return score;
}

export function formatEventTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isEventToday(iso: string, timezone: string, ref = new Date()): boolean {
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  return day(new Date(iso)) === day(ref);
}
