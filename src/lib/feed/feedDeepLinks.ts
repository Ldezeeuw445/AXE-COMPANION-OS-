import type { AxeFeedItem } from "@/types/feed";

const DEFAULT_TF = "h1";

export function chartDeepLink(symbol: string, tf = DEFAULT_TF): string {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return "/chart";
  return `/chart?symbol=${encodeURIComponent(sym)}&tf=${encodeURIComponent(tf.toLowerCase())}`;
}

export function feedItemLinkLabel(item: AxeFeedItem): string {
  if (item.kind === "chart_action") return "Open chart";
  if (item.kind === "trade_draft") return "Review draft";
  if (item.kind === "proactive") {
    if (item.url?.startsWith("/chart")) return "Open chart";
    if (item.url === "/positions") return "Open positions";
    if (item.url === "/cockpit" || item.url === "/history") return "View trade";
    if (item.url === "/alerts") return "Open alerts";
  }
  return "Open";
}

export function inferFeedItemUrl(item: AxeFeedItem): string | null {
  if (item.url) return item.url;
  if (item.kind === "trade_draft") return "/actions";
  return null;
}
