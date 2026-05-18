"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

export function renderMarkdownInline(content: string, strongClassName = "font-semibold text-cyan-100"): ReactNode[] {
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
          className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-cyan-400/35 bg-cyan-400/10 px-2.5 py-0.5 align-baseline text-[11.5px] font-semibold text-cyan-200/95 hover:border-cyan-400/60 hover:bg-cyan-400/15"
        >
          {label}
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>,
      );
    } else if (match[4]) {
      parts.push(
        <strong key={`${match.index}-strong`} className={strongClassName}>
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
            <h3 key={`h-${blockIndex}`} className="text-[13px] font-semibold uppercase tracking-[0.14em] text-cyan-100/95">
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
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cyan-300/75" aria-hidden />
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

