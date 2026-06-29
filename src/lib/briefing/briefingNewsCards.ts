import type { MarketContext } from "@/lib/market/marketTypes";
import type { BriefNewsCard } from "@/lib/briefing/briefBodyFormat";
import { isBreakingNewsText } from "@/lib/briefing/briefBodyFormat";

const INTEL_PLACEHOLDER =
  "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=60";

/** Pick headline cards with optional images for the morning brief NEWS section. */
export function buildBriefNewsCards(ctx: MarketContext, limit = 2): BriefNewsCard[] {
  const cards: BriefNewsCard[] = [];

  for (const item of ctx.news.slice(0, 8)) {
    if (!item.title?.trim()) continue;
    const breaking = isBreakingNewsText(`${item.title} ${item.summary ?? ""}`);
    cards.push({
      type: "news",
      title: item.title.trim(),
      summary: item.summary?.trim().slice(0, 200) ?? null,
      imageUrl: item.imageUrl?.trim() || (breaking ? INTEL_PLACEHOLDER : null),
      source: item.source,
      url: item.url,
      breaking,
    });
  }

  for (const ev of ctx.events.filter((e) => e.impact === "high").slice(0, 3)) {
    const title = ev.title?.trim();
    if (!title) continue;
    const breaking = isBreakingNewsText(title);
    cards.push({
      type: "news",
      title,
      summary: `${ev.currency ?? ev.country ?? "Global"} · ${new Date(ev.startsAt).toLocaleString("en-GB", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      imageUrl: INTEL_PLACEHOLDER,
      source: "AXE Calendar",
      breaking,
    });
  }

  return cards
    .sort((a, b) => Number(Boolean(b.breaking)) - Number(Boolean(a.breaking)))
    .filter((card, idx, arr) => arr.findIndex((c) => c.title === card.title) === idx)
    .slice(0, limit);
}
