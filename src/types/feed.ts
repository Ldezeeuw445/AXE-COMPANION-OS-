export type AxeFeedItemKind =
  | "proactive"
  | "trade_draft"
  | "chart_action"
  | "briefing"
  | "daily_news"
  | "market_recap"
  | "system";

export type AxeFeedItem = {
  id: string;
  kind: AxeFeedItemKind;
  title: string;
  body: string;
  url: string | null;
  createdAt: string;
  /** Present on briefing feed items — daily vs weekly outlook */
  briefingType?: "daily" | "weekly";
};
