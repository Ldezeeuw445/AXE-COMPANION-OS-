/**
 * Server-side checks every brief / broadcast passes before it is saved.
 *
 *  1. Closed markets: no "watch / trade / monitor X today" for a market that
 *     is closed right now (weekend, holiday). A closed market may only appear
 *     framed as a weekly outlook, the gap risk at the reopen, or "closed".
 *  2. Focus: no ticker outside the trader's chosen markets and their labelled
 *     drivers (the AUDCAD / AUD-CPI briefs).
 *
 * The LLM gets one retry with the violations spelled out; what still fails is
 * cut sentence by sentence. Dependency-free (node --test).
 */

import type { MarketStatusSummary } from "@/lib/market/marketHours";
import { canonicalSymbol } from "@/lib/market/marketHours";
import { mentionedTickers, type BriefFocus } from "@/lib/briefing/briefFocus";

export type ContentViolation =
  | { kind: "closed_market_today"; symbol: string; sentence: string }
  | { kind: "off_focus_symbol"; symbol: string; sentence: string };

const ALIASES: Array<[RegExp, string[]]> = [
  [/\bgold\b/i, ["XAUUSD"]],
  [/\bsilver\b/i, ["XAGUSD"]],
  [/\b(crude|oil|wti)\b/i, ["WTI", "USOUSD"]],
  [/\bbrent\b/i, ["BRENT", "UKOUSD"]],
  [/\b(dow|dow jones)\b/i, ["US30"]],
  [/\bs&p\b|\bs&p ?500\b/i, ["SPX500", "US500"]],
  [/\bnasdaq\b/i, ["NAS100", "US100"]],
  [/\b(euro|eur\/usd)\b/i, ["EURUSD"]],
  [/\b(cable|pound|sterling)\b/i, ["GBPUSD"]],
];

/** Present-tense calls to act on a market right now. */
const ACT_NOW =
  /\b(today|this session|this morning|tonight|right now|now|currently|intraday|watch|monitor|keep an eye|look for|consider (?:longs?|shorts?|buying|selling|shorting|going)|enter|entries|entry|go long|go short|buy|sell|scalp|breakouts?|reversals?|trading at|is trading|session opens?|as the (?:asian|london|new york|ny) session)\b/i;

/** Framing that is honest about a closed market. */
const CLOSED_FRAMING =
  /\b(closed|reopen(?:s|ing)?|re-open|at the open|when (?:it|the market|markets) (?:re)?opens?|gap|weekly outlook|next week|this week ahead|week ahead|monday|sunday open|sunday's open|last close|friday'?s close|weekend)\b/i;

export function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function symbolsIn(sentence: string): string[] {
  const out = new Set(mentionedTickers(sentence).map(canonicalSymbol));
  for (const [re, syms] of ALIASES) if (re.test(sentence)) syms.forEach((s) => out.add(s));
  return [...out];
}

export function findClosedMarketViolations(text: string, status: MarketStatusSummary): ContentViolation[] {
  const closed = new Set(status.statuses.filter((s) => !s.open).map((s) => s.symbol));
  // Closed markets the trader did not ask about can still be named in a "markets closed" line.
  if (closed.size === 0 && !status.tradFiWeekend) return [];
  const out: ContentViolation[] = [];
  for (const sentence of splitSentences(text)) {
    if (/^[A-Z][A-Z' ]+$/.test(sentence)) continue; // section header
    if (CLOSED_FRAMING.test(sentence)) continue;
    if (!ACT_NOW.test(sentence)) continue;
    for (const sym of symbolsIn(sentence)) {
      const isClosed =
        closed.has(sym) ||
        (status.tradFiWeekend && !/^(BTC|ETH|SOL|XRP|LTC|ADA|DOGE|BNB)/.test(sym));
      if (isClosed) {
        out.push({ kind: "closed_market_today", symbol: sym, sentence });
        break;
      }
    }
  }
  return out;
}

export function findOffFocusViolations(text: string, focus: BriefFocus): ContentViolation[] {
  const allowed = new Set([...focus.markets.map((m) => m.symbol), ...focus.drivers.map((d) => d.symbol)]);
  const out: ContentViolation[] = [];
  for (const sentence of splitSentences(text)) {
    for (const t of mentionedTickers(sentence)) {
      if (!allowed.has(t)) {
        out.push({ kind: "off_focus_symbol", symbol: t, sentence });
        break;
      }
    }
  }
  return out;
}

export function validateBriefContent(
  text: string,
  ctx: { status: MarketStatusSummary; focus: BriefFocus | null },
): ContentViolation[] {
  return [
    ...findClosedMarketViolations(text, ctx.status),
    ...(ctx.focus ? findOffFocusViolations(text, ctx.focus) : []),
  ];
}

export function describeContentViolations(v: ContentViolation[]): string {
  const lines = v.slice(0, 8).map((x) =>
    x.kind === "closed_market_today"
      ? `- "${x.sentence}" tells the trader to act on ${x.symbol} now, but ${x.symbol} is CLOSED. Rewrite it as an outlook for the reopen / gap risk, or drop it.`
      : `- "${x.sentence}" names ${x.symbol}, which is not one of the trader's markets. Remove it.`,
  );
  return `Your brief broke these rules:\n${lines.join("\n")}\nRewrite the whole brief with the same structure and fix every line above.`;
}

export function stripContentViolations(text: string, v: ContentViolation[]): string {
  if (v.length === 0) return text;
  let out = text;
  for (const x of v) out = out.split(x.sentence).join("");
  return out
    .split("\n")
    .map((l) => l.replace(/\s{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
