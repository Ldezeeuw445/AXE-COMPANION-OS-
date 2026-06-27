export type AxeFeedItemKind =
  | "proactive"
  | "trade_draft"
  | "chart_action"
  | "briefing"
  | "system";

export type AxeFeedItem = {
  id: string;
  kind: AxeFeedItemKind;
  title: string;
  body: string;
  url: string | null;
  createdAt: string;
};
