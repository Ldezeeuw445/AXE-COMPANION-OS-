"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode, CSSProperties } from "react";
import {
  AXE_COLORS,
  AXE_TERM_COLORS,
  AXE_SUBLABEL_TERMS,
} from "@/lib/axe/colorSystem";

/* ── Three-tier colour hierarchy for AXE chat ──────────────────────
   Tier 1 — Section headers: purple (#B18CFF), bold — they anchor
            each analysis block. Consistent across all AXE output.
   Tier 2 — Sub-labels: plain white bold — calm, no colour noise.
   Tier 3 — Key detail keywords: matte semantic colour per trading
            concept so users build colour→context muscle memory.

   Colour source: AXE Color System PDF (7 semantic colours).
   All term→hex mappings live in `@/lib/axe/colorSystem`.          */

type KeywordTier = {
  tier: 1 | 2 | 3;
  cls: string;
  style?: CSSProperties;
};

function classifyKeyword(text: string): KeywordTier | null {
  const lower = text.toLowerCase().replace(/:$/, "").trim();

  // Tier 3 — semantic colour lookup (includes section headers)
  const hex = AXE_TERM_COLORS[lower];
  if (hex) {
    // Section headers (purple) → tier 1 styling: bold
    if (hex === AXE_COLORS.sectionPurple) {
      return { tier: 1, cls: "font-bold", style: { color: hex } };
    }
    // Regular semantic keyword → tier 3: semibold + colour
    return { tier: 3, cls: "font-semibold", style: { color: hex } };
  }

  // Tier 2 — sub-labels: white bold, no colour
  if (AXE_SUBLABEL_TERMS.has(lower)) {
    return { tier: 2, cls: "font-semibold text-white" };
  }

  return null;
}

export function renderMarkdownInline(
  content: string,
  strongClassName = "font-semibold text-white",
): ReactNode[] {
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
      // Three-tier keyword colouring
      const kw = classifyKeyword(match[4]);
      const cls = kw ? kw.cls : strongClassName;
      const style = kw?.style;
      parts.push(
        <strong key={`${match.index}-strong`} className={cls} style={style}>
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
        const lines = block
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const heading =
          lines.length === 1 ? lines[0].match(/^#{1,3}\s+(.+)$/) : null;
        if (heading) {
          return (
            <h3
              key={`h-${blockIndex}`}
              className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/90"
            >
              {renderMarkdownInline(heading[1])}
            </h3>
          );
        }

        const isList = lines.every((line) => /^([-*•]|\d+\.)\s+/.test(line));
        if (isList) {
          return (
            <ul key={`ul-${blockIndex}`} className="space-y-1.5">
              {lines.map((line, i) => (
                <li
                  key={`${blockIndex}-${i}`}
                  className="flex gap-2 text-sm leading-relaxed"
                >
                  <span
                    className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/40"
                    aria-hidden
                  />
                  <span>
                    {renderMarkdownInline(
                      line.replace(/^([-*•]|\d+\.)\s+/, ""),
                    )}
                  </span>
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
