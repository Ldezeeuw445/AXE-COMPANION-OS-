import type { SymbolFactsResult } from "@/lib/briefing/priceFacts";

/**
 * Server-side check on briefing text: every number that reads as a price of a
 * market must sit within `PRICE_BAND` of that market's real last price.
 *
 * Built for the 2026-11-16 Weekly Outlook that put gold at 1950 / 1920 and
 * bitcoin at 30,000 (real: ~3,860 and ~65,000). A number is attributed to the
 * market named in its sentence, or — "If it breaks above 1950" — to the last
 * market named earlier in the same paragraph. Percentages, times, dates,
 * signed or currency amounts (P/L), list numbers and small counts are not
 * prices and are skipped.
 */
export const PRICE_BAND = 0.15;

const ALIASES: Record<string, string[]> = {
  XAUUSD: ["xauusd", "xau/usd", "xau", "gold"],
  XAGUSD: ["xagusd", "xag/usd", "xag", "silver"],
  BTCUSD: ["btcusd", "btc/usd", "btc", "bitcoin"],
  ETHUSD: ["ethusd", "eth/usd", "eth", "ethereum"],
  US30: ["us30", "dow"],
  NAS100: ["nas100", "nasdaq", "us100"],
  SPX500: ["spx500", "s&p", "us500"],
  USOIL: ["usoil", "wti", "crude"],
};

function aliasesFor(symbol: string): string[] {
  const up = symbol.toUpperCase();
  const known = ALIASES[up] ?? [];
  const base = [up.toLowerCase()];
  if (/^[A-Z]{6}$/.test(up)) base.push(`${up.slice(0, 3)}/${up.slice(3)}`.toLowerCase());
  return Array.from(new Set([...base, ...known]));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

export type PriceViolation = { symbol: string | null; value: number; reference: number | null; sentence: string };

type Ref = { symbol: string; price: number | null };

const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*$/i;

function priceNumbers(sentence: string): Array<{ value: number; decimals: number }> {
  const out: Array<{ value: number; decimals: number }> = [];
  const re = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) {
    const raw = m[1];
    const start = m.index;
    const end = start + raw.length;
    const before = sentence.slice(Math.max(0, start - 12), start);
    const after = sentence.slice(end, end + 12);
    if (/^\s*(%|percent|x\b|:\d|h\b|am\b|pm\b|utc\b|gmt\b|cet\b|pips?\b|points?\b|pts\b|lots?\b|trades?\b|days?\b|weeks?\b|hours?\b|minutes?\b|min\b|times\b|setups?\b|sessions?\b|\/100)/i.test(after)) continue;
    if (/[:/]\s*$/.test(before) || /^\s*[:/]\d/.test(after)) continue; // 07:00, 1:100, dates
    if (/[$€£¥]\s*$/.test(before)) continue; // currency amounts are P/L, not prices
    if (/(^|[^\d\s])\s*[+\-−]\s*$/.test(before) || /(^|\s)[+\-−]$/.test(before)) continue; // signed P/L; "1,920–1,950" stays a range
    if (/\b(usd|eur|gbp)\s*$/i.test(before)) continue;
    if (MONTHS.test(before) || /^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(after)) continue;
    if (/^\s*\.\s/.test(after) && /(^|\n)\s*$/.test(before)) continue; // "1. " list item
    if (/^\s*[-–]\s*\d\b/.test(after) && Number(raw) < 10) continue; // "2-3 setups"
    const value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    out.push({ value, decimals: raw.includes(".") ? raw.split(".")[1].length : 0 });
  }
  return out;
}

/** Split into paragraphs → sentences, keeping the paragraph for carry-over. */
function paragraphs(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n|\n(?=[A-Z][A-Z' ]{3,}\n)/)
    .map((p) => p.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((s) => s.trim()).filter(Boolean));
}

export function findPriceViolations(text: string, results: SymbolFactsResult[]): PriceViolation[] {
  const refs: Ref[] = results.map((r) => (r.ok ? { symbol: r.facts.symbol, price: r.facts.lastPrice } : { symbol: r.symbol.toUpperCase(), price: null }));
  // Known symbols beyond the facts: a level for a market we have no data on is never allowed.
  for (const sym of Object.keys(ALIASES)) {
    if (!refs.some((r) => r.symbol === sym)) refs.push({ symbol: sym, price: null });
  }
  const matchers = refs.map((r) => ({
    ref: r,
    re: new RegExp(`(^|[^a-z0-9])(${aliasesFor(r.symbol).map(escapeRe).join("|")})(?=$|[^a-z0-9])`, "i"),
  }));

  const violations: PriceViolation[] = [];
  for (const para of paragraphs(text)) {
    let carried: Ref[] = [];
    for (const sentence of para) {
      const named = matchers.filter((m) => m.re.test(sentence)).map((m) => m.ref);
      const inScope = named.length > 0 ? named : carried;
      if (named.length > 0) carried = named;
      const numbers = priceNumbers(sentence);
      if (numbers.length === 0) continue;
      for (const { value, decimals } of numbers) {
        if (inScope.length === 0) {
          // A level with no market named anywhere before it in the paragraph.
          if (value >= 10 && /\b(level|resistance|support|near|above|below|around|target|break|zone)\b/i.test(sentence)) {
            violations.push({ symbol: null, value, reference: null, sentence });
          }
          continue;
        }
        const plausible = inScope.filter((r) => r.price != null && value >= r.price * 0.1 && value <= r.price * 10);
        if (inScope.every((r) => r.price != null && (value < r.price * 0.1 || value > r.price * 10))) {
          continue; // a count or size, not a price of these markets (e.g. "3 setups" next to gold)
        }
        if (plausible.length === 0) {
          // Named market has no live data: no number for it is allowed.
          if (value >= 10 || decimals >= 3) violations.push({ symbol: inScope[0]?.symbol ?? null, value, reference: null, sentence });
          continue;
        }
        const ok = plausible.some((r) => Math.abs(value / (r.price as number) - 1) <= PRICE_BAND);
        if (!ok) {
          violations.push({ symbol: plausible[0].symbol, value, reference: plausible[0].price, sentence });
        }
      }
    }
  }
  return violations;
}

/**
 * Last resort after a regenerate still failed: drop every sentence that
 * carries a rejected number, so no made-up level ever reaches the trader.
 */
export function stripViolatingSentences(text: string, violations: PriceViolation[]): string {
  let out = text;
  for (const s of new Set(violations.map((v) => v.sentence))) {
    out = out.split(s).join("");
  }
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Feedback for the one regenerate: which numbers were wrong and what the real prices are. */
export function describeViolationsForRetry(violations: PriceViolation[]): string {
  const lines = violations.slice(0, 6).map((v) =>
    v.reference != null
      ? `- ${v.value} for ${v.symbol} is wrong: the live price is ${v.reference}.`
      : `- ${v.value}${v.symbol ? ` for ${v.symbol}` : ""} has no live data behind it — remove it.`,
  );
  return `Your previous draft named price levels that are not real:\n${lines.join("\n")}\nRewrite it. Use ONLY numbers from PRICE FACTS. If a market has no live price, do not give it any level.`;
}
