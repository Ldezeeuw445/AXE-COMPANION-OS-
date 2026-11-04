/**
 * Chat symbol/timeframe context resolution.
 *
 * The pill at the top of chat is often stale — traders rarely glance at it.
 * Message-mentioned symbols always win; an untouched pill is only a weak hint.
 */

import { SYMBOL_ALIASES, cleanDisplaySymbol } from "@/lib/broker/symbolResolution";

/** How long a pill selection stays "fresh" after the trader last touched it. */
export const SYMBOL_TOUCH_FRESH_MS = 30 * 60 * 1000;

/** Sentinel used when logging memory / learning without a trustworthy symbol. */
export const GENERAL_CHAT_SYMBOL = "GENERAL";

export type ChatSymbolResolution = {
  /** First symbol (or alias) detected in the user message, if any. */
  mentionedSymbol: string | null;
  /** Sanitized pill symbol from the session (may be null/empty). */
  pillSymbol: string | null;
  /** Whether the pill was touched within SYMBOL_TOUCH_FRESH_MS. */
  pillFresh: boolean;
  /**
   * Symbol to use for answers, Trading OS context, memory, learning-arc, and
   * journal logging. Null means do not attribute to any chart symbol.
   */
  effectiveSymbol: string | null;
  /** True when the pill should be switched to the mentioned symbol. */
  shouldAutoSwitchPill: boolean;
  /**
   * True when the pill is stale (or empty) and the message named no symbol —
   * AXE must ask rather than assume the chart context.
   */
  chartContextStale: boolean;
  /** Extra system-prompt line when chartContextStale (or null). */
  promptHint: string | null;
};

const STALE_PROMPT_HINT =
  "CHART CONTEXT MAY BE STALE — the trader's selected symbol/timeframe pill was not updated recently and this message names no instrument. Do NOT assume the pill symbol. Ask which market they mean before analysing levels, setups, or that chart. Attribute memory/learning to general chat, not a symbol.";

const FX_CCY = new Set([
  "USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "XAU", "XAG", "BTC", "ETH",
]);

type AliasRow = { alias: string; canonical: string };

let cachedAliasRows: AliasRow[] | null = null;
let cachedKnownTokens: Set<string> | null = null;

function aliasRows(): AliasRow[] {
  if (cachedAliasRows) return cachedAliasRows;
  const rows: AliasRow[] = [];
  const seen = new Set<string>();
  const push = (alias: string, canonical: string) => {
    const key = alias.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push({ alias: key, canonical });
  };

  for (const [canonical, aliases] of Object.entries(SYMBOL_ALIASES)) {
    const display = cleanDisplaySymbol(canonical) || canonical.toUpperCase();
    push(canonical, display);
    for (const alias of aliases) push(alias, display);
  }
  push("gold", "XAUUSD");
  push("silver", "XAGUSD");
  push("bitcoin", "BTCUSD");
  push("ether", "ETHUSD");
  push("ethereum", "ETHUSD");

  rows.sort((a, b) => b.alias.length - a.alias.length);
  cachedAliasRows = rows;
  return rows;
}

function knownTokens(): Set<string> {
  if (cachedKnownTokens) return cachedKnownTokens;
  const set = new Set<string>();
  for (const row of aliasRows()) {
    set.add(row.alias.toUpperCase());
    set.add(row.canonical.toUpperCase());
  }
  cachedKnownTokens = set;
  return set;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksLikeFxPair(token: string): boolean {
  if (token.length !== 6) return false;
  return FX_CCY.has(token.slice(0, 3)) && FX_CCY.has(token.slice(3));
}

/**
 * Detect trading symbols mentioned in free text via the alias registry
 * (gold → XAUUSD, eurusd → EURUSD, …) plus bare canonical tickers.
 * Returns unique uppercase display symbols in first-appearance order.
 */
export function detectSymbolsInText(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];

  type Hit = { index: number; symbol: string };
  const hits: Hit[] = [];
  const lower = raw.toLowerCase();

  for (const row of aliasRows()) {
    const pattern = new RegExp(
      `(^|[^a-z0-9])(${escapeRegExp(row.alias)})(?=[^a-z0-9]|$)`,
      "gi",
    );
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lower)) !== null) {
      const token = match[2] ?? "";
      const index = match.index + (match[1]?.length ?? 0);
      hits.push({ index, symbol: row.canonical });
      // Avoid zero-width loops on empty matches.
      if (token.length === 0) pattern.lastIndex += 1;
    }
  }

  // Bare tokens that are known registry symbols or FX pairs.
  const tokenRe = /\b[A-Za-z]{2,10}\b/g;
  let tokenMatch: RegExpExecArray | null;
  while ((tokenMatch = tokenRe.exec(raw)) !== null) {
    const token = tokenMatch[0]!.toUpperCase();
    if (token === "XAAUSD") {
      hits.push({ index: tokenMatch.index, symbol: "XAUUSD" });
      continue;
    }
    if (knownTokens().has(token) || looksLikeFxPair(token)) {
      const cleaned = cleanDisplaySymbol(token) || token;
      hits.push({ index: tokenMatch.index, symbol: cleaned });
    }
  }

  hits.sort((a, b) => a.index - b.index || a.symbol.localeCompare(b.symbol));

  const found: string[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (seen.has(hit.symbol)) continue;
    seen.add(hit.symbol);
    found.push(hit.symbol);
  }
  return found;
}

export function isPillFresh(
  symbolTouchedAt: string | number | Date | null | undefined,
  nowMs: number = Date.now(),
  freshMs: number = SYMBOL_TOUCH_FRESH_MS,
): boolean {
  if (symbolTouchedAt == null || symbolTouchedAt === "") return false;
  const touched =
    typeof symbolTouchedAt === "number"
      ? symbolTouchedAt
      : symbolTouchedAt instanceof Date
        ? symbolTouchedAt.getTime()
        : Date.parse(String(symbolTouchedAt));
  if (!Number.isFinite(touched)) return false;
  return nowMs - touched <= freshMs;
}

export function resolveChatSymbolContext(input: {
  messageText: string;
  pillSymbol?: string | null;
  symbolTouchedAt?: string | number | Date | null;
  nowMs?: number;
  freshMs?: number;
}): ChatSymbolResolution {
  const mentioned = detectSymbolsInText(input.messageText)[0] ?? null;
  const pillRaw = (input.pillSymbol ?? "").trim();
  const pillSymbol = pillRaw ? cleanDisplaySymbol(pillRaw) || pillRaw.toUpperCase() : null;
  const pillFresh = isPillFresh(input.symbolTouchedAt, input.nowMs, input.freshMs);

  if (mentioned) {
    return {
      mentionedSymbol: mentioned,
      pillSymbol,
      pillFresh,
      effectiveSymbol: mentioned,
      shouldAutoSwitchPill: mentioned !== pillSymbol,
      chartContextStale: false,
      promptHint: null,
    };
  }

  if (pillSymbol && pillFresh) {
    return {
      mentionedSymbol: null,
      pillSymbol,
      pillFresh: true,
      effectiveSymbol: pillSymbol,
      shouldAutoSwitchPill: false,
      chartContextStale: false,
      promptHint: null,
    };
  }

  return {
    mentionedSymbol: null,
    pillSymbol,
    pillFresh: false,
    effectiveSymbol: null,
    shouldAutoSwitchPill: false,
    chartContextStale: true,
    promptHint: STALE_PROMPT_HINT,
  };
}

/** Symbol string for logging tables — GENERAL when resolution has none. */
export function loggingSymbolForResolution(resolution: ChatSymbolResolution): string {
  return resolution.effectiveSymbol ?? GENERAL_CHAT_SYMBOL;
}
