"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

/* ── Three-tier colour hierarchy for AXE chat ──────────────────────────
   Tier 1 — Section headers: cyan, bold — they anchor each analysis block.
   Tier 2 — Sub-labels: plain white bold — calm, no colour noise.
   Tier 3 — Key detail keywords: matte semantic colour per trading concept
            so users build colour→context muscle memory over time.          */

/** Tier 1 — Main section headers → cyan + bold (anchor the section) */
const HEADER_KEYWORDS = new Set([
  "market structure",
  "outlook",
  "analysis",
  "summary",
  "trade plan",
  "trade setup",
  "overview",
  "technical analysis",
  "fundamental analysis",
  "sentiment",
  "price action",
  "macro overview",
  "risk assessment",
  "weekly outlook",
  "daily outlook",
  "session recap",
  "trading plan",
  "setup review",
  "journal review",
  "performance review",
]);

/** Tier 2 — Sub-labels → white bold, no colour (keeps it calm) */
const SUBLABEL_KEYWORDS = new Set([
  "bias",
  "key levels",
  "key level",
  "trend",
  "current price",
  "neutral",
  "timeframe",
  "context",
  "note",
  "notes",
  "conclusion",
  "recommendation",
  "invalidation",
  "confirmation",
  "execution",
  "session",
  "day range",
  "range",
  "structure",
  "momentum",
  "volatility",
  "volume",
  "liquidity",
]);

/** Tier 3 — Key detail keywords → matte semantic colour per concept.
 *  7 colour groups · 55+ terms for full trading vocabulary. */
const SEMANTIC_KEYWORDS: Record<string, string> = {
  // ── Rose: risk / resistance / bearish ──
  resistance: "text-rose-300/85",
  "stop loss": "text-rose-300/85",
  sl: "text-rose-300/85",
  risk: "text-rose-300/85",
  bearish: "text-rose-300/85",
  sell: "text-rose-300/85",
  short: "text-rose-300/85",
  "supply zone": "text-rose-300/85",
  supply: "text-rose-300/85",
  rejection: "text-rose-300/85",
  distribution: "text-rose-300/85",
  overbought: "text-rose-300/85",
  "lower high": "text-rose-300/85",
  "lower low": "text-rose-300/85",
  lh: "text-rose-300/85",
  ll: "text-rose-300/85",

  // ── Emerald: support / entry / bullish ──
  support: "text-emerald-300/85",
  "take profit": "text-emerald-300/85",
  tp: "text-emerald-300/85",
  entry: "text-emerald-300/85",
  bullish: "text-emerald-300/85",
  buy: "text-emerald-300/85",
  long: "text-emerald-300/85",
  "demand zone": "text-emerald-300/85",
  demand: "text-emerald-300/85",
  accumulation: "text-emerald-300/85",
  oversold: "text-emerald-300/85",
  "higher high": "text-emerald-300/85",
  "higher low": "text-emerald-300/85",
  hh: "text-emerald-300/85",
  hl: "text-emerald-300/85",

  // ── Sky / Indigo: patterns & formations ──
  consolidation: "text-sky-300/80",
  "breakout watch": "text-indigo-300/85",
  breakout: "text-indigo-300/85",
  "break of structure": "text-indigo-300/85",
  bos: "text-indigo-300/85",
  "change of character": "text-indigo-300/85",
  choch: "text-indigo-300/85",
  "market shift": "text-indigo-300/85",
  mss: "text-indigo-300/85",
  "fair value gap": "text-sky-300/80",
  fvg: "text-sky-300/80",
  imbalance: "text-sky-300/80",
  "order block": "text-sky-300/80",
  ob: "text-sky-300/80",
  confluence: "text-sky-300/80",
  divergence: "text-sky-300/80",

  // ── Pink: reversals & turning points ──
  reversal: "text-pink-300/80",
  "swing failure": "text-pink-300/80",
  sfp: "text-pink-300/80",
  "liquidity sweep": "text-pink-300/80",
  sweep: "text-pink-300/80",
  "stop hunt": "text-pink-300/80",
  manipulation: "text-pink-300/80",

  // ── Amber: catalysts & ratios ──
  catalysts: "text-amber-300/85",
  catalyst: "text-amber-300/85",
  "risk/reward": "text-amber-300/85",
  "r:r": "text-amber-300/85",
  nfp: "text-amber-300/85",
  fomc: "text-amber-300/85",
  cpi: "text-amber-300/85",
  ppi: "text-amber-300/85",
  gdp: "text-amber-300/85",
  "interest rate": "text-amber-300/85",
  fed: "text-amber-300/85",
  ecb: "text-amber-300/85",

  // ── Violet: indicators & tools ──
  fibonacci: "text-violet-300/80",
  fib: "text-violet-300/80",
  ema: "text-violet-300/80",
  sma: "text-violet-300/80",
  vwap: "text-violet-300/80",
  rsi: "text-violet-300/80",
  macd: "text-violet-300/80",
  atr: "text-violet-300/80",
  bollinger: "text-violet-300/80",

  // ── Teal: session & timing ──
  "london open": "text-teal-300/80",
  "new york open": "text-teal-300/80",
  "asian session": "text-teal-300/80",
  "london session": "text-teal-300/80",
  "new york session": "text-teal-300/80",
  killzone: "text-teal-300/80",
};

type KeywordTier = { tier: 1 | 2 | 3; cls: string };

function classifyKeyword(text: string): KeywordTier | null {
  const lower = text.toLowerCase().replace(/:$/, "").trim();
  if (HEADER_KEYWORDS.has(lower))
    return { tier: 1, cls: "font-bold text-cyan-300" };
  if (SUBLABEL_KEYWORDS.has(lower))
    return { tier: 2, cls: "font-semibold text-white" };
  const color = SEMANTIC_KEYWORDS[lower];
  if (color) return { tier: 3, cls: `font-semibold ${color}` };
  return null;
}

export function renderMarkdownInline(content: string, strongClassName = "font-semibold text-white"): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\[\[link:([^|\]]+)\|([^\]]+)\]\]|\*\*([^*]+)\*\*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    if (match.index > cursor) parts.push(content.slice(cursor, match.index));
    if (match[2] && match[3]) {
      const href = match[2].trim();
      const label = match[3].trim();
      parts.push(
        <Link
          key={`${match.index}-${href}`}
          href={href}
          className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-white/[0.10] bg-white/[0.05] px-2.5 py-0.5 align-baseline text-[11.5px] font-semibold text-white/85 hover:border-white/[0.18] hover:bg-white/[0.08]"
        >
          {label}
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>,
      );
    } else if (match[4]) {
      // Three-tier keyword colouring: headers → cyan, sub-labels → white, details → semantic
      const kw = classifyKeyword(match[4]);
      const cls = kw ? kw.cls : strongClassName;
      parts.push(
        <strong key={`${match.index}-strong`} className={cls}>
          {match[4]}
        </strong>,
      );
    }
    cursor = re.lastIndex;
  }
  if (cursor < content.length) parts.push(content.slice(cursor));
  return parts;
}

export function MarkdownLite({
  content,
  className = "space-y-3",
  paragraphClassName = "whitespace-pre-wrap text-sm leading-relaxed",
}: {
  content: string;
  className?: string;
  paragraphClassName?: string;
}) {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length === 0) return null;

  return (
    <div className={className}>
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        const heading = lines.length === 1 ? lines[0].match(/^#{1,3}\s+(.+)$/) : null;
        if (heading) {
          return (
            <h3 key={`h-${blockIndex}`} className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/90">
              {renderMarkdownInline(heading[1])}
            </h3>
          );
        }

        const isList = lines.every((line) => /^([-*•]|\d+\.)\s+/.test(line));
        if (isList) {
          return (
            <ul key={`ul-${blockIndex}`} className="space-y-1.5">
              {lines.map((line, i) => (
                <li key={`${blockIndex}-${i}`} className="flex gap-2 text-sm leading-relaxed">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/40" aria-hidden />
                  <span>{renderMarkdownInline(line.replace(/^([-*•]|\d+\.)\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`p-${blockIndex}`} className={paragraphClassName}>
            {renderMarkdownInline(block.replace(/^#{1,3}\s+/, ""))}
          </p>
        );
      })}
    </div>
  );
}
