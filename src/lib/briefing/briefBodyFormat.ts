/** Parse and normalize AXE morning brief body text for structured UI rendering. */

export type BriefNewsCard = {
  type: "news";
  title: string;
  summary?: string | null;
  imageUrl?: string | null;
  source?: string;
  url?: string;
  breaking?: boolean;
};

export type BriefHighlight =
  | { pair?: string; type?: undefined }
  | BriefNewsCard;

export type BriefSection = {
  id: "greeting" | "market_outlook" | "news" | "watch";
  label?: string;
  paragraphs: string[];
  breaking?: boolean;
};

const SECTION_MARKERS: Array<{ id: BriefSection["id"]; labels: string[] }> = [
  { id: "market_outlook", labels: ["MARKET OUTLOOK", "MARKET OUTLOOK:", "OUTLOOK"] },
  { id: "news", labels: ["NEWS", "NEWS:", "HEADLINES"] },
  { id: "watch", labels: ["WATCH THIS SESSION", "SESSION WATCH", "WATCH", "TODAY'S WATCH"] },
];

const BREAKING_RE =
  /\b(fed|fomc|ecb|boe|rate cut|rate hike|trump|tariff|war|cpi|nfp|payroll|default|crash|emergency|breaking|geopolit|sanction|inflation print)\b/i;

const DEFAULT_PAIRS = [
  "XAUUSD",
  "BTCUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "NAS100",
  "US30",
  "US500",
  "GER40",
  "XAGUSD",
  "OILUSD",
  "WTI",
];

/** Strip markdown emphasis markers the model sometimes emits. */
export function stripBriefMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

export function isBreakingNewsText(text: string): boolean {
  return BREAKING_RE.test(text);
}

/** Wrap known trading pairs in ** so MarkdownLite renders them bold. */
export function emphasizeTradingPairs(text: string, extraPairs: string[] = []): string {
  const pairs = [...new Set([...DEFAULT_PAIRS, ...extraPairs.map((p) => p.toUpperCase())])].sort(
    (a, b) => b.length - a.length,
  );
  let out = text;
  for (const pair of pairs) {
    const re = new RegExp(`(?<!\\*)\\b(${pair.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b(?!\\*)`, "gi");
    out = out.replace(re, "**$1**");
  }
  return out;
}

function findSectionIndex(upper: string): { id: BriefSection["id"]; index: number; len: number } | null {
  let best: { id: BriefSection["id"]; index: number; len: number } | null = null;
  for (const marker of SECTION_MARKERS) {
    for (const label of marker.labels) {
      const idx = upper.indexOf(label);
      if (idx === -1) continue;
      if (!best || idx < best.index) {
        best = { id: marker.id, index: idx, len: label.length };
      }
    }
  }
  return best;
}

export function parseBriefSections(body: string): BriefSection[] {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const upper = normalized.toUpperCase();
  const first = findSectionIndex(upper);

  if (!first) {
    const paras = normalized
      .split(/\n{2,}/)
      .map((p) => stripBriefMarkdown(p.trim()))
      .filter(Boolean);
    return paras.length ? [{ id: "greeting", paragraphs: paras }] : [];
  }

  const sections: BriefSection[] = [];
  const greeting = stripBriefMarkdown(normalized.slice(0, first.index).trim());
  if (greeting) {
    sections.push({
      id: "greeting",
      paragraphs: greeting.split(/\n+/).map((p) => p.trim()).filter(Boolean),
    });
  }

  let cursor = first.index + first.len;
  let currentId = first.id;

  while (cursor < normalized.length) {
    const restUpper = normalized.toUpperCase();
    const next = findSectionIndex(restUpper.slice(cursor));
    const nextAbs = next ? cursor + next.index : -1;

    const sliceEnd = next && next.index > 0 ? nextAbs : normalized.length;
    const chunk = normalized.slice(cursor, sliceEnd).trim();
    const cleaned = stripBriefMarkdown(chunk.replace(/^[\s:–-]+/, "").trim());
    const paragraphs = cleaned
      .split(/\n{2,}|\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (paragraphs.length) {
      const label =
        currentId === "market_outlook"
          ? "Market outlook"
          : currentId === "news"
            ? "News"
            : currentId === "watch"
              ? "Watch this session"
              : undefined;
      sections.push({
        id: currentId,
        label,
        paragraphs,
        breaking: currentId === "news" && paragraphs.some((p) => isBreakingNewsText(p)),
      });
    }

    if (!next || next.index <= 0) break;
    cursor = nextAbs + next.len;
    currentId = next.id;
  }

  return sections;
}

export function sectionDisplayLabel(id: BriefSection["id"]): string | undefined {
  if (id === "market_outlook") return "Market outlook";
  if (id === "news") return "News";
  if (id === "watch") return "Watch this session";
  return undefined;
}

export function newsCardsFromHighlights(
  highlights: Array<{ pair?: string; type?: string; [key: string]: unknown }> | undefined,
): BriefNewsCard[] {
  if (!highlights?.length) return [];
  return highlights
    .filter((h) => h.type === "news" && typeof h.title === "string")
    .map((h) => ({
      type: "news" as const,
      title: String(h.title),
      summary: typeof h.summary === "string" ? h.summary : null,
      imageUrl: typeof h.imageUrl === "string" ? h.imageUrl : null,
      source: typeof h.source === "string" ? h.source : undefined,
      url: typeof h.url === "string" ? h.url : undefined,
      breaking: Boolean(h.breaking),
    }));
}

export function pairHighlights(
  highlights: Array<{ pair?: string; type?: string }> | undefined,
): string[] {
  if (!highlights?.length) return [];
  return highlights
    .filter((h) => h.pair && h.type !== "news")
    .map((h) => String(h.pair).toUpperCase());
}
