import type { AxeFeedItem, AxeFeedItemKind } from "@/types/feed";

export type FeedTabId = "morning_brief" | "daily_news" | "market_recap";

export type FeedTabDef = {
  id: FeedTabId;
  label: string;
  /** Tailwind classes for active tab + unread badge */
  accentText: string;
  accentBg: string;
  accentBorder: string;
  badgeBg: string;
};

export const FEED_TABS: FeedTabDef[] = [
  {
    id: "morning_brief",
    label: "Morning Brief",
    accentText: "text-tos-gold",
    accentBg: "bg-tos-gold/12",
    accentBorder: "border-tos-gold/40",
    badgeBg: "bg-[#d4b84a]",
  },
  {
    id: "daily_news",
    label: "Daily News",
    accentText: "text-tos-news",
    accentBg: "bg-tos-news/12",
    accentBorder: "border-tos-news/40",
    badgeBg: "bg-[#38bdf8]",
  },
  {
    id: "market_recap",
    label: "Market Recap",
    accentText: "text-emerald-400",
    accentBg: "bg-emerald-500/12",
    accentBorder: "border-emerald-400/40",
    badgeBg: "bg-emerald-400",
  },
];

const MORNING_BRIEF_KINDS = new Set<AxeFeedItemKind>([
  "briefing",
  "proactive",
  "trade_draft",
  "chart_action",
  "system",
]);

export function feedItemTab(item: AxeFeedItem): FeedTabId {
  if (item.kind === "daily_news") return "daily_news";
  if (item.kind === "market_recap") return "market_recap";
  return "morning_brief";
}

export function itemBelongsToFeedTab(item: AxeFeedItem, tab: FeedTabId): boolean {
  if (tab === "daily_news") return item.kind === "daily_news";
  if (tab === "market_recap") return item.kind === "market_recap";
  return MORNING_BRIEF_KINDS.has(item.kind);
}

export function getFeedTabDef(tab: FeedTabId): FeedTabDef {
  return FEED_TABS.find((t) => t.id === tab) ?? FEED_TABS[0];
}

export function parseFeedTabParam(value: string | null | undefined): FeedTabId {
  if (value === "daily_news" || value === "market_recap" || value === "morning_brief") {
    return value;
  }
  return "morning_brief";
}

export function feedTabHref(tab: FeedTabId): string {
  if (tab === "morning_brief") return "/feed";
  return `/feed?tab=${tab}`;
}
