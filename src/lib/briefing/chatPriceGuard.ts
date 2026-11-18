import { detectSymbolsInText } from "@/lib/chat/resolveChatSymbolContext";
import {
  describeViolationsForRetry,
  findPriceViolations,
  PRICE_BAND,
  stripViolatingSentences,
  type PriceViolation,
} from "@/lib/briefing/briefPriceValidator";
import {
  formatPrice,
  formatPriceFactBlock,
  formatUtc,
  type SymbolFactsResult,
} from "@/lib/briefing/priceFacts";

/**
 * Price guard for AXE chat — the same PRICE FACTS + validator the briefs got in
 * PR #183, applied to chat answers.
 *
 *  1. Prompt: when the turn concerns a market (symbol in the message, the
 *     effective chart symbol, or the last user turns), the system prompt gets
 *     the PRICE FACTS block (real prices: MT5 broker feed GET-only → Twelve
 *     Data → Yahoo) plus hard rules. No market → nothing injected, no lookups.
 *  2. Post-check: the final answer is run through `findPriceViolations`. A
 *     number near a market outside ±15% of its live price (or any level for a
 *     market without live data) → regenerate once with feedback, then strip
 *     the offending sentences and add a short correction note.
 *
 * Streaming: tokens are already on the wire when the check runs, so the
 * route does not buffer (no added latency for clean answers). The corrected
 * answer is what gets saved; both chat clients reload the thread on `done`,
 * which swaps the streamed draft for the saved one. For clients that do not
 * reload (e.g. Trading OS over CORS) a correction note is streamed as a final
 * token so the wrong draft never stands uncorrected.
 */

export const CHAT_PRICE_MAX_SYMBOLS = 3;
export const CHAT_PRICE_VALIDATE_MAX_SYMBOLS = 4;
export const CHAT_PRICE_CACHE_OK_MS = 60_000;
export const CHAT_PRICE_CACHE_FAIL_MS = 20_000;

// Bare words the chat symbol detector can return next to the canonical symbol.
const WORD_TO_SYMBOL: Record<string, string> = {
  GOLD: "XAUUSD",
  SILVER: "XAGUSD",
  BITCOIN: "BTCUSD",
  BTC: "BTCUSD",
  ETHEREUM: "ETHUSD",
  ETH: "ETHUSD",
};

function normalize(symbol: string | null | undefined): string {
  const s = String(symbol ?? "").toUpperCase().replace("/", "").trim();
  return WORD_TO_SYMBOL[s] ?? s;
}

function dedupe(list: Array<string | null | undefined>, max: number): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const s = normalize(raw);
    if (!s || out.includes(s)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Markets this chat turn is about. Empty → no price facts, no post-check. */
export function detectChatPriceSymbols(input: {
  message: string;
  effectiveSymbol?: string | null;
  recentUserMessages?: string[];
}): string[] {
  const fromMessage = detectSymbolsInText(input.message ?? "");
  const fromHistory = (input.recentUserMessages ?? []).slice(-2).flatMap((m) => detectSymbolsInText(m ?? ""));
  return dedupe([...fromMessage, input.effectiveSymbol ?? null, ...fromHistory], CHAT_PRICE_MAX_SYMBOLS);
}

/** Prompt symbols plus any market the answer itself names (so those get checked against real data too). */
export function symbolsForChatValidation(promptSymbols: string[], reply: string): string[] {
  return dedupe([...promptSymbols, ...detectSymbolsInText(reply ?? "")], CHAT_PRICE_VALIDATE_MAX_SYMBOLS);
}

export function chatPriceFactRules(results: SymbolFactsResult[]): string {
  const anyOk = results.some((r) => r.ok);
  return `Price rules for this answer (hard — a server check removes any price that breaks them):
- Every price, level, high, low, entry, stop or target you name for a market must come from PRICE FACTS or sit close to its live price there (you may round). Never use a price from memory or training data — those are years out of date.
- Key levels are the day, previous-day, week, previous-week and 20-day highs/lows listed in PRICE FACTS. Do not invent other levels.
- ${anyOk ? "A market marked LIVE PRICE UNAVAILABLE gets no number at all — say its live data is unavailable right now." : "No live prices are available right now: say so plainly and name no price or level for any market."}`;
}

/** System-prompt block for the detected markets ("" when there are none). */
export function buildChatPriceFactsPrompt(results: SymbolFactsResult[]): string {
  if (results.length === 0) return "";
  return `${formatPriceFactBlock(results)}\n\n${chatPriceFactRules(results)}`;
}

/**
 * Briefing validator, tuned for chat: a level with no market named in its
 * paragraph is only a violation when it is not near any live price we hold
 * (chat answers often say "stop below 3,850" a paragraph after naming gold).
 */
export function findChatPriceViolations(text: string, results: SymbolFactsResult[]): PriceViolation[] {
  const live = results.flatMap((r) => (r.ok ? [r.facts.lastPrice] : []));
  return findPriceViolations(text, results).filter(
    (v) => !(v.symbol == null && live.some((p) => Math.abs(v.value / p - 1) <= PRICE_BAND)),
  );
}

export function livePriceSummary(results: SymbolFactsResult[]): string {
  return results
    .map((r) =>
      r.ok
        ? `${r.facts.symbol} ${formatPrice(r.facts.lastPrice)} (${r.facts.sourceLabel}, ${formatUtc(r.facts.asOf)})`
        : `${r.symbol.toUpperCase()} live data unavailable`,
    )
    .join(" · ");
}

export function chatPriceCorrectionNote(results: SymbolFactsResult[]): string {
  const live = livePriceSummary(results);
  return `_Price check: levels that did not match live market data were removed.${live ? ` Live: ${live}.` : ""}_`;
}

/** Streamed after a wrong draft so a client that does not reload the thread still sees the correction. */
export function chatPriceStreamNote(results: SymbolFactsResult[]): string {
  const live = livePriceSummary(results);
  return `\n\n_Price check: this draft named levels that do not match live market data — the saved answer has been corrected.${live ? ` Live: ${live}.` : ""}_`;
}

export type ChatPriceGuardResult = {
  text: string;
  /** Violations found in the first draft. */
  violations: PriceViolation[];
  regenerated: boolean;
  stripped: boolean;
  changed: boolean;
};

/**
 * Validate a finished chat answer. `regenerate` gets the retry feedback and
 * returns a new answer (or null); it is called at most once.
 */
export async function guardChatReply(input: {
  reply: string;
  facts: SymbolFactsResult[];
  regenerate?: (feedback: string) => Promise<string | null>;
}): Promise<ChatPriceGuardResult> {
  const { reply, facts } = input;
  const violations = findChatPriceViolations(reply, facts);
  if (violations.length === 0) {
    return { text: reply, violations, regenerated: false, stripped: false, changed: false };
  }

  let text = reply;
  let remaining = violations;
  let regenerated = false;
  if (input.regenerate) {
    const retry = await input.regenerate(describeViolationsForRetry(violations)).catch(() => null);
    if (retry && retry.trim()) {
      regenerated = true;
      text = retry.trim();
      remaining = findChatPriceViolations(text, facts);
    }
  }

  let stripped = false;
  if (remaining.length > 0) {
    stripped = true;
    text = stripViolatingSentences(text, remaining);
    if (!text.trim()) {
      text = "I won't give price levels I can't verify against live market data right now.";
    }
    text = `${text}\n\n${chatPriceCorrectionNote(facts)}`;
  }
  return { text, violations, regenerated, stripped, changed: true };
}

/** Short per-user cache so a chat burst about the same market does not refetch prices. */
export type ChatPriceFactsLoader = (symbols: string[], now: Date) => Promise<SymbolFactsResult[]>;

export function createChatPriceFactsCache(opts: { okMs?: number; failMs?: number } = {}) {
  const okMs = opts.okMs ?? CHAT_PRICE_CACHE_OK_MS;
  const failMs = opts.failMs ?? CHAT_PRICE_CACHE_FAIL_MS;
  const store = new Map<string, { at: number; result: SymbolFactsResult }>();
  return async function load(
    userId: string,
    symbols: string[],
    loader: ChatPriceFactsLoader,
    now = new Date(),
  ): Promise<SymbolFactsResult[]> {
    const wanted = dedupe(symbols, CHAT_PRICE_VALIDATE_MAX_SYMBOLS);
    if (wanted.length === 0) return [];
    const hits = new Map<string, SymbolFactsResult>();
    for (const s of wanted) {
      const hit = store.get(`${userId}|${s}`);
      if (hit && now.getTime() - hit.at < (hit.result.ok ? okMs : failMs)) hits.set(s, hit.result);
    }
    const missing = wanted.filter((s) => !hits.has(s));
    if (missing.length > 0) {
      const fresh = await loader(missing, now).catch(
        (): SymbolFactsResult[] => missing.map((symbol) => ({ ok: false, symbol, reason: "price lookup failed" })),
      );
      for (const r of fresh) {
        const s = normalize(r.ok ? r.facts.symbol : r.symbol);
        hits.set(s, r);
        store.set(`${userId}|${s}`, { at: now.getTime(), result: r });
      }
      if (store.size > 500) store.clear();
    }
    return wanted.map((s) => hits.get(s) ?? { ok: false, symbol: s, reason: "price lookup failed" });
  };
}
