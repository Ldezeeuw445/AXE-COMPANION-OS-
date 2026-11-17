import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeBriefMarketContext } from "./briefMarketDigest";
import type { EconomicEvent, MarketContext, NewsItem } from "@/lib/market/marketTypes";

const NOW = new Date("2026-11-16T07:00:00Z"); // Monday

function news(title: string, publishedAt: string): NewsItem {
  return { id: title, title, url: "https://x", source: "Reuters", publishedAt, provider: "finnhub" } as NewsItem;
}
function event(title: string, startsAt: string, impact: "high" | "medium" | "low"): EconomicEvent {
  return { id: title, title, startsAt, impact, currency: "USD" } as unknown as EconomicEvent;
}

const ctx: MarketContext = {
  symbol: "XAUUSD",
  symbols: ["XAUUSD"],
  generatedAt: NOW.toISOString(),
  macro: null,
  news: [
    news("Gold rallies as Fed rate cut bets grow", "2026-11-15T20:00:00Z"),
    news("Gold slides on hawkish Fed minutes", "2026-11-03T10:00:00Z"),
  ],
  events: [
    event("CPI m/m", "2026-11-18T13:30:00Z", "high"),
    event("Retail sales", "2026-11-19T13:30:00Z", "medium"),
    event("Nonfarm payrolls", "2026-12-04T13:30:00Z", "high"),
  ],
  providers: [],
  hasLiveData: true,
};

describe("brief market digest", () => {
  it("weekly: dated calendar for this week only, and no 2-week-old headline", () => {
    const out = summarizeBriefMarketContext(ctx, "Europe/Amsterdam", { weekly: true, now: NOW });
    assert.match(out, /This week's economic calendar/);
    assert.match(out, /CPI m\/m/);
    assert.match(out, /Retail sales/);
    assert.doesNotMatch(out, /Nonfarm payrolls/);
    assert.match(out, /Gold rallies as Fed rate cut bets grow/);
    assert.doesNotMatch(out, /hawkish Fed minutes/);
  });
  it("daily: headlines older than 72h are dropped and the brief is told there is no news", () => {
    const out = summarizeBriefMarketContext({ ...ctx, news: [ctx.news[1]!] }, "Europe/Amsterdam", { now: NOW });
    assert.match(out, /Headlines: none from the last 72 hours/);
  });
});
