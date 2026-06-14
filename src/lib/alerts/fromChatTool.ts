/**
 * Maps AXE chat `create_alert` tool args into a `user_alerts` row.
 * Keeps chat-created alerts visible on /alerts and evaluable on the chart.
 */

export type ChatCreateAlertInput = {
  title: string;
  body: string;
  type: string;
  symbol?: string;
};

const TYPE_MAP: Record<string, string> = {
  price: "price",
  condition: "price",
  reminder: "journal_reminder",
  risk: "position_risk",
  news: "news",
  system: "macro",
};

function parseThreshold(text: string): number | null {
  const match = text.match(/\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+)\b/);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseCondition(text: string): "above" | "below" | null {
  const lower = text.toLowerCase();
  if (/\b(below|under|drops|falls|breaks below|break down)\b/.test(lower)) return "below";
  if (/\b(above|over|breaks|breaks above|hits|reaches|break out)\b/.test(lower)) return "above";
  return null;
}

export function buildUserAlertFromChatTool(input: ChatCreateAlertInput) {
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  const rawType = String(input.type ?? "system").trim();
  let type = TYPE_MAP[rawType] ?? "macro";
  const symbol = input.symbol?.toUpperCase().trim() || null;
  const combined = `${title} ${body}`.trim();

  const threshold = parseThreshold(combined);
  let condition = parseCondition(combined);

  if (type === "price") {
    if (threshold == null || !condition) {
      // Without a numeric level + direction, store as a reminder so it still appears in /alerts.
      type = "journal_reminder";
    }
  }

  const keyword =
    type === "news" || type === "macro"
      ? (body || title).slice(0, 160)
      : type === "journal_reminder"
        ? title.slice(0, 160)
        : null;

  return {
    symbol,
    type,
    condition: type === "price" ? condition : null,
    threshold: type === "price" && threshold != null ? threshold : null,
    keyword,
    status: "active" as const,
    metadata: {
      title,
      body,
      source: "axe_chat",
      delivery: "in_app",
      raw_type: rawType,
    },
  };
}
