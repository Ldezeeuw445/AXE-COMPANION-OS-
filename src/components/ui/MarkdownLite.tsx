"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

/* ── Semantic keyword colours for AXE chat ─────────────────────────────
   Matte, premium palette inspired by Linear's restrained use of colour.
   Each trading concept gets a dedicated hue so AXE analysis is scannable
   without feeling like a christmas tree. */
const SEMANTIC_KEYWORDS: Record<string, string> = {
  // Structure & direction
  "market structure": "text-violet-300/85",
  bias: "text-violet-300/85",
  outlook: "text-violet-300/85",
  trend: "text-violet-300/85",
  // Levels
  resistance: "text-rose-300/85",
  support: "text-emerald-300/85",
  "key levels": "text-amber-300/85",
  "key level": "text-amber-300/85",
  "take profit": "text-emerald-300/85",
  "stop loss": "text-rose-300/85",
  tp: "text-emerald-300/85",
  sl: "text-rose-300/85",
  // Patterns
  consolidation: "text-sky-300/80",
  "breakout watch": "text-indigo-300/85",
  breakout: "text-indigo-300/85",
  reversal: "text-pink-300/80",
  // Catalysts
  catalysts: "text-amber-300/85",
  catalyst: "text-amber-300/85",
  // Risk & entries
  entry: "text-emerald-300/85",
  risk: "text-rose-300/85",
  "risk/reward": "text-amber-300/85",
  "r:r": "text-amber-300/85",
  // Sentiment
  bullish: "text-emerald-300/85",
  bearish: "text-rose-300/85",
  neutral: "text-white/70",
};

function semanticColor(text: string): string | null {
  const lower = text.toLowerCase().replace(/:$/, "").trim();
  return SEMANTIC_KEYWORDS[lower] ?? null;
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
      // Check for semantic keyword colouring (e.g. **Resistance:** or **Bullish**)
      const color = semanticColor(match[4]);
      const cls = color ? `font-semibold ${color}` : strongClassName;
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
