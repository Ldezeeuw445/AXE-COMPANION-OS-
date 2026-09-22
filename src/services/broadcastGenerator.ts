import "server-only";
import { buildMarketContext } from "@/lib/market/marketContextService";
import { callLLM } from "@/services/llmClient";
import type { MarketContext } from "@/lib/market/marketTypes";

/**
 * Broadcast feed copy, written from this app's own market data.
 *
 * Krater is gone. The obvious replacement — "ask the local model for today's
 * news" — would be worse than no feed at all: an offline model has no idea what
 * happened today and will invent plausible headlines, which then ship to every
 * user as fact. So the model never supplies facts here. It only writes up the
 * FRED macro snapshot, the economic calendar and (when a news key exists) real
 * headlines that buildMarketContext already fetched. With no data at all this
 * throws, and the cron reports a skip instead of publishing fiction.
 *
 * Generation runs through callLLM's 'chat' path, so it uses the VPS's own
 * Ollama first and only falls back to OpenAI — the broadcast costs nothing per
 * run in the normal case.
 */

export type BroadcastKind = "daily_news" | "market_recap";

/** What a broadcast covers — not one trader's watchlist. */
const BROADCAST_SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD"];

const SYSTEM_PROMPT = `You are AXE, writing one broadcast for every AXE user.

Absolute rule: use ONLY the facts in the DATA block. You have no other knowledge
of today's market. Never invent a headline, a price, a level, a percentage or an
event. If the DATA block has nothing on a topic, leave that topic out entirely
rather than guessing or padding.

Never address anyone by name — this goes to all users. No trade advice, no
entries, no targets. Direct, factual, confident.`;

function dailyNewsPrompt(data: string): string {
  return `Write today's trading brief from the DATA block below.

Format: 3-6 short bullets, max 180 words, then one final line starting
"Watch today:" naming what the calendar actually shows. If the DATA block has no
events, make that final line about the macro readings instead.

DATA
${data}`;
}

function marketRecapPrompt(data: string): string {
  return `Write the end-of-day recap from the DATA block below.

Format: short bullets, max 200 words, then one closing line
"What to watch tomorrow." drawn from the calendar in the DATA block.

DATA
${data}`;
}

/** Facts only — every line traces back to a provider response. */
function formatDataBlock(contexts: MarketContext[]): { text: string; hasData: boolean } {
  const lines: string[] = [];
  const seenHeadlines = new Set<string>();
  const seenEvents = new Set<string>();

  const macro = contexts.find((c) => c.macro && c.macro.points.length > 0)?.macro;
  if (macro) {
    const points = macro.points
      .filter((p) => p.value != null)
      .map((p) => `- ${p.label}: ${p.value}${p.units ?? ""}${p.observedAt ? ` (as of ${p.observedAt})` : ""}`);
    if (points.length > 0) lines.push("MACRO (FRED)", ...points);
  }

  const events: string[] = [];
  for (const ctx of contexts) {
    for (const e of ctx.events) {
      const key = `${e.title}|${e.startsAt}`;
      if (seenEvents.has(key)) continue;
      seenEvents.add(key);
      events.push(
        `- ${new Date(e.startsAt).toISOString().slice(0, 16)}Z ${e.title} (${e.currency ?? e.country ?? "?"}, impact ${e.impact ?? "unknown"})`,
      );
    }
  }
  if (events.length > 0) lines.push("", "ECONOMIC CALENDAR", ...events.slice(0, 12));

  const headlines: string[] = [];
  for (const ctx of contexts) {
    for (const n of ctx.news) {
      const key = n.title.toLowerCase();
      if (seenHeadlines.has(key)) continue;
      seenHeadlines.add(key);
      headlines.push(`- ${n.title} — ${n.source}`);
    }
  }
  if (headlines.length > 0) lines.push("", "HEADLINES", ...headlines.slice(0, 14));

  return { text: lines.join("\n"), hasData: lines.length > 0 };
}

export async function generateBroadcastLocally(kind: BroadcastKind): Promise<string> {
  const contexts = await Promise.all(
    BROADCAST_SYMBOLS.map((symbol) =>
      buildMarketContext({ symbol, newsLimit: 6, calendarLimit: 12 }).catch(() => null),
    ),
  );
  const usable = contexts.filter((c): c is MarketContext => c != null);
  const { text, hasData } = formatDataBlock(usable);

  if (!hasData) {
    const missing = (usable[0]?.providers ?? [])
      .filter((p) => p.state === "missing_config")
      .map((p) => (p.env ?? []).join("/"))
      .filter(Boolean);
    throw new Error(
      `no_market_data_to_broadcast${missing.length ? `: no provider returned rows (unconfigured: ${missing.join(", ")})` : ""}`,
    );
  }

  const response = await callLLM(
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: kind === "daily_news" ? dailyNewsPrompt(text) : marketRecapPrompt(text) },
      ],
      temperature: 0.2,
      max_tokens: 700,
    },
    "chat",
  );

  const body = response.content?.trim();
  if (!body) {
    throw new Error(`broadcast_generation_empty: ${response.provider} ${response.error ?? "no content"}`);
  }
  return body;
}
