import type { AxeFeedItemKind } from "@/types/feed";

/** Global AXE feed kind labels — consistent across chat strip, feed page, cockpit. */
export function feedKindLabel(
  kind: AxeFeedItemKind,
  opts?: { briefingType?: "daily" | "weekly" },
): string {
  if (kind === "briefing") {
    return opts?.briefingType === "weekly" ? "Weekly outlook" : "Morning brief";
  }
  if (kind === "trade_draft") return "Trade draft";
  if (kind === "chart_action") return "Chart action";
  if (kind === "proactive") return "AXE noticed";
  return "System";
}

type FeedKindStyle = {
  /** Tailwind text class for titles / kind labels */
  text: string;
  /** Tailwind bg + text for badges */
  badge: string;
  /** CSS variable for accent dot / borders */
  accentVar: string;
  /** tos-accent-dot modifier */
  dot: string;
};

/**
 * Global feed kind colors — mapped to CSS vars in globals.css so users
 * recognise item types instantly (gold = brief, news-blue = proactive, etc.).
 */
const FEED_KIND_STYLES: Record<AxeFeedItemKind, FeedKindStyle> = {
  briefing: {
    text: "text-tos-gold/95",
    badge: "bg-tos-gold/10 text-tos-gold",
    accentVar: "var(--tos-accent-gold)",
    dot: "tos-accent-dot--amber",
  },
  proactive: {
    text: "text-tos-news/95",
    badge: "bg-tos-news/10 text-tos-news",
    accentVar: "var(--tos-news)",
    dot: "tos-accent-dot--cyan",
  },
  trade_draft: {
    text: "text-tos-actions/95",
    badge: "bg-tos-actions/10 text-tos-actions",
    accentVar: "var(--icon-actions)",
    dot: "tos-accent-dot--cyan",
  },
  chart_action: {
    text: "text-tos-audio/95",
    badge: "bg-tos-audio/10 text-tos-audio",
    accentVar: "var(--tos-audio)",
    dot: "tos-accent-dot--emerald",
  },
  system: {
    text: "text-tos-muted",
    badge: "bg-white/[0.06] text-tos-muted",
    accentVar: "var(--tos-text-dim)",
    dot: "tos-accent-dot--rose",
  },
};

export function feedKindStyle(kind: AxeFeedItemKind): FeedKindStyle {
  return FEED_KIND_STYLES[kind] ?? FEED_KIND_STYLES.system;
}
