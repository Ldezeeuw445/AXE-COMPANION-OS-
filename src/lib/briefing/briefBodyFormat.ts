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
  | BriefNewsCard
  | BriefEventChip;

export type BriefEventChip = {
  type: "event";
  title: string;
  time: string;
  impact: string;
  currency?: string;
};

export type BriefSection = {
  id:
    | "greeting"
    | "market_outlook"
    | "news"
    | "recent_performance"
    | "alignment"
    | "action_items"
    | "watch";
  label?: string;
  paragraphs: string[];
  breaking?: boolean;
  italicLabel?: boolean;
};

const SECTION_MARKERS: Array<{ id: BriefSection["id"]; labels: string[] }> = [
  { id: "market_outlook", labels: ["MARKET OUTLOOK", "MARKET OUTLOOK:"] },
  { id: "news", labels: ["NEWS", "NEWS:", "HEADLINES"] },
  {
    id: "recent_performance",
    labels: ["RECENT PERFORMANCE", "RECENT PERFORMANCE:", "RECENT TRADES"],
  },
  {
    id: "alignment",
    labels: ["ALIGNMENT SCORE", "ALIGNMENT SCORE:"],
  },
  { id: "action_items", labels: ["ACTION ITEMS", "ACTION ITEMS:", "TRADE IDEAS", "TRADE IDEAS:"] },
  {
    id: "watch",
    labels: [
      "WATCH THIS SESSION",
      "SESSION WATCH",
      "SESSION FOCUS",
      "TODAY'S WATCH",
      "WATCH THIS SESSION:",
      "SESSION FOCUS:",
    ],
  },
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

/** Normalize malformed unicode/mojibake that occasionally leaks from upstream feeds. */
export function normalizeBriefText(text: string): string {
  return text
    // common mojibake punctuation
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€“/g, "-")
    .replace(/â€”/g, " - ")
    .replace(/â€¦/g, "...")
    .replace(/Â/g, "")
    // replacement chars / zero-width artifacts
    .replace(/\uFFFD/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // normalize spacing
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Strip markdown emphasis markers the model sometimes emits. */
export function stripBriefMarkdown(text: string): string {
  return normalizeBriefText(
    text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/^\s*[\*#]+\s*$/gm, "")
    // Repair broken bold splits like "**K**\ney indicators" → "Key indicators"
    .replace(/^([A-Za-z])\n(?=[a-z])/gm, "$1")
    // Drop orphan letter lines before a capitalized word ("K\nThe …" not a real word split)
    .replace(/^([A-Za-z])\n(?=[A-Z])/gm, "")
    .trim(),
  );
}

/** Fix glued orphan prefixes like "KThe" or "SToday's" left by bad markdown splits. */
export function repairBriefParagraph(text: string): string {
  const normalized = normalizeBriefText(text);
  const m = normalized.match(/^([A-Z])([A-Z][a-z].*)$/);
  if (m && m[2]) return m[2];
  return normalized;
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Section headers must appear on their own line — avoids splitting on "alignment" mid-sentence. */
function findSectionAtLine(
  text: string,
  fromIndex: number,
): { id: BriefSection["id"]; index: number; len: number } | null {
  let best: { id: BriefSection["id"]; index: number; len: number } | null = null;

  for (const marker of SECTION_MARKERS) {
    for (const label of marker.labels) {
      const re = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*:?(?=\\s*(?:\\n|$))`, "gi");
      re.lastIndex = fromIndex;
      const match = re.exec(text);
      if (!match) continue;
      const lineStart = match[0].startsWith("\n") ? match.index + 1 : match.index;
      if (lineStart < fromIndex) continue;
      if (!best || lineStart < best.index) {
        best = { id: marker.id, index: lineStart, len: match[0].trimStart().length };
      }
    }
  }

  return best;
}

function mergeOrphanParagraphs(paragraphs: string[]): string[] {
  const merged: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!.trim();
    if (!p) continue;

    // Lone letter from broken markdown — only glue when next line continues the same word
    if (/^[A-Za-z]$/.test(p) && i + 1 < paragraphs.length) {
      const next = paragraphs[i + 1]!.trimStart();
      if (/^[a-z]/.test(next)) {
        paragraphs[i + 1] = `${p}${next}`;
      }
      continue;
    }

    const words = p.split(/\s+/);
    const isOrphan = words.length <= 2 && p.length < 24;
    if (isOrphan && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${p}`;
    } else {
      merged.push(p);
    }
  }

  return merged.filter((p) => !/^[A-Za-z]$/.test(p));
}

export function parseBriefSections(body: string): BriefSection[] {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const first = findSectionAtLine(normalized, 0);

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
    const next = findSectionAtLine(normalized, cursor + 1);

    const sliceEnd = next && next.index > cursor ? next.index : normalized.length;
    const chunk = normalized.slice(cursor, sliceEnd).trim();
    const cleaned = stripBriefMarkdown(chunk.replace(/^[\s:–-]+/, "").trim());
    let paragraphs = cleaned
      .split(/\n{2,}|\n/)
      .map((p) => repairBriefParagraph(p.trim()))
      .filter(Boolean);
    paragraphs = mergeOrphanParagraphs(paragraphs);

    // Drop paragraphs that only repeat the section header label
    if (currentId === "alignment") {
      paragraphs = paragraphs.filter(
        (p) => !/^alignment\s*score\s*$/i.test(p) && !/^our\s*$/i.test(p),
      );
    }

    if (paragraphs.length) {
      const label = sectionDisplayLabel(currentId);
      sections.push({
        id: currentId,
        label,
        paragraphs,
        breaking: currentId === "news" && paragraphs.some((p) => isBreakingNewsText(p)),
        italicLabel: isItalicBriefSection(currentId),
      });
    }

    if (!next || next.index <= cursor) break;
    cursor = next.index + next.len;
    currentId = next.id;
  }

  return sections;
}

export function sectionDisplayLabel(id: BriefSection["id"]): string | undefined {
  if (id === "market_outlook") return "Market outlook";
  if (id === "news") return "News";
  if (id === "recent_performance") return "Recent performance";
  if (id === "alignment") return "Alignment score";
  if (id === "action_items") return "Action items";
  if (id === "watch") return "Watch this session";
  return undefined;
}

export function isItalicBriefSection(id: BriefSection["id"]): boolean {
  return id === "recent_performance" || id === "alignment" || id === "action_items";
}

export function eventsFromHighlights(
  highlights: Array<{ type?: string; [key: string]: unknown }> | undefined,
): BriefEventChip[] {
  if (!highlights?.length) return [];
  return highlights
    .filter((h) => h.type === "event" && typeof h.title === "string")
    .map((h) => ({
      type: "event" as const,
      title: String(h.title),
      time: typeof h.time === "string" ? h.time : "",
      impact: typeof h.impact === "string" ? h.impact : "unknown",
      currency: typeof h.currency === "string" ? h.currency : undefined,
    }));
}

export function newsCardsFromHighlights(
  highlights: Array<{ pair?: string; type?: string; [key: string]: unknown }> | undefined,
): BriefNewsCard[] {
  if (!highlights?.length) return [];
  return highlights
    .filter((h) => h.type === "news" && typeof h.title === "string" && h.imageUrl)
    .slice(0, 1)
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
