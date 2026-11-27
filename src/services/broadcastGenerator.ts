import "server-only";
import { buildMarketContext } from "@/lib/market/marketContextService";
import { callLLM } from "@/services/llmClient";
import type { MarketContext } from "@/lib/market/marketTypes";
import { describeMarketStatus, summarizeMarketStatus, type MarketStatusSummary } from "@/lib/market/marketHours";
import { findClosedMarketViolations } from "@/lib/briefing/briefContentGuard";

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

When you use a headline, stay close to its wording and name the outlet. Do not
add a figure, a cause or a conclusion the headline does not state.

Never address anyone by name — this goes to all users. No trade advice, no
entries, no targets. Direct, factual, confident.`;

/** True when FX / metals / indices are shut (weekend or a full holiday) — crypto only. */
export function broadcastClosedDay(status: MarketStatusSummary): boolean {
  const nonCrypto = status.statuses.filter((s) => s.assetClass !== "crypto");
  return status.tradFiWeekend || (nonCrypto.length > 0 && nonCrypto.every((s) => !s.open && s.reason === "holiday"));
}

const CLOSED_RULES = `MARKET STATUS rules (hard): a market marked CLOSED gets no "today", no
"this session", no "watch it now". Frame it only as closed / last close /
what to expect at the reopen (time in MARKET STATUS) / week ahead. Only
markets marked OPEN — on a weekend that is crypto — can have a today line.`;

export function dailyNewsPrompt(data: string, closedDay = false): string {
  if (closedDay) {
    return `Write today's brief from the DATA block below. FX, metals and indices are CLOSED (see MARKET STATUS); crypto is the only market trading.

Format: 3-5 short bullets, max 180 words: first what is open (crypto), then the
week ahead for the closed markets. End with one line starting "At the reopen:"
naming the reopen time and the dated calendar events of the coming week.

${CLOSED_RULES}

DATA
${data}`;
  }
  return `Write today's trading brief from the DATA block below.

Format: 3-6 short bullets, max 180 words, then one final line starting
"Watch today:" naming what the calendar actually shows. If the DATA block has no
events, make that final line about the macro readings instead.

${CLOSED_RULES}

DATA
${data}`;
}

export function marketRecapPrompt(data: string, closedDay = false): string {
  if (closedDay) {
    return `Write today's recap from the DATA block below. FX, metals and indices did not trade today (see MARKET STATUS) — do not describe a session for them.

Format: short bullets, max 160 words: crypto, then what changed for the week
ahead. Close with one line "At the reopen:" with the reopen time from MARKET
STATUS and the dated events of the coming week.

${CLOSED_RULES}

DATA
${data}`;
  }
  return `Write the end-of-day recap from the DATA block below.

Format: short bullets, max 200 words, then one closing line
"What to watch tomorrow." drawn from the calendar in the DATA block.

${CLOSED_RULES}

DATA
${data}`;
}

/** Facts only — every line traces back to a provider response. */
export function formatDataBlock(contexts: MarketContext[], status?: MarketStatusSummary): { text: string; hasData: boolean } {
  const lines: string[] = [];
  const statusLines = status ? status.statuses.map((s) => `- ${describeMarketStatus(s, "Europe/Amsterdam")}`) : [];
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

  const hasData = lines.length > 0;
  if (statusLines.length > 0) {
    lines.unshift("MARKET STATUS (exchange hours, computed now)", ...statusLines, ...(status?.holiday ? [`- Holiday: ${status.holiday}`] : []), "");
  }
  return { text: lines.join("\n"), hasData };
}

/**
 * Every number in the copy must come from the DATA block.
 *
 * The model paraphrases headlines, and a paraphrase is where an invented
 * figure gets in ("inflation expected to exceed 4%" when no source said 4%).
 * Numbers are the part of a broadcast a trader would act on, so an ungrounded
 * one disqualifies the draft.
 */
function ungroundedNumbers(body: string, data: string): string[] {
  const inData = new Set(data.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const used = body.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return [...new Set(used)].filter((n) => !inData.has(n));
}

/** Facts with no model in the loop — the fallback when a draft cannot be trusted. */
export function renderDeterministicBroadcast(kind: BroadcastKind, data: string, closedDay = false): string {
  const closing = closedDay
    ? "At the reopen: the calendar entries listed above. Until then only crypto is trading."
    : kind === "daily_news"
      ? "Watch today: the calendar entries listed above."
      : "What to watch tomorrow: the calendar entries listed above.";
  return `${data}\n\n${closing}`;
}

export async function generateBroadcastLocally(kind: BroadcastKind, now: Date = new Date()): Promise<string> {
  const status = summarizeMarketStatus(BROADCAST_SYMBOLS, now);
  const closedDay = broadcastClosedDay(status);
  const contexts = await Promise.all(
    BROADCAST_SYMBOLS.map((symbol) =>
      buildMarketContext({ symbol, newsLimit: 6, calendarLimit: 12 }).catch(() => null),
    ),
  );
  const usable = contexts.filter((c): c is MarketContext => c != null);
  const { text, hasData } = formatDataBlock(usable, status);

  if (!hasData) {
    const missing = (usable[0]?.providers ?? [])
      .filter((p) => p.state === "missing_config")
      .map((p) => (p.env ?? []).join("/"))
      .filter(Boolean);
    throw new Error(
      `no_market_data_to_broadcast${missing.length ? `: no provider returned rows (unconfigured: ${missing.join(", ")})` : ""}`,
    );
  }

  const prompt = kind === "daily_news" ? dailyNewsPrompt(text, closedDay) : marketRecapPrompt(text, closedDay);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await callLLM(
      {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              attempt === 0
                ? prompt
                : `${prompt}\n\nYour previous draft used figures that are not in the DATA block, or told readers to act today on a market that MARKET STATUS marks CLOSED. Rewrite it using only numbers that appear above, verbatim, and frame closed markets only as "at the reopen".`,
          },
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

    const ungrounded = ungroundedNumbers(body, text);
    const closedHits = findClosedMarketViolations(body, status);
    if (ungrounded.length === 0 && closedHits.length === 0) return body;
    if (ungrounded.length > 0) {
      console.warn(`[broadcast] ${kind} draft ${attempt + 1} used ungrounded figures: ${ungrounded.join(", ")}`);
    }
    if (closedHits.length > 0) {
      console.warn(`[broadcast] ${kind} draft ${attempt + 1} told readers to act on closed markets: ${closedHits.map((h) => h.symbol).join(", ")}`);
    }
  }

  console.warn(`[broadcast] ${kind} falling back to the data block verbatim (last draft rejected)`);
  return renderDeterministicBroadcast(kind, text, closedDay);
}
