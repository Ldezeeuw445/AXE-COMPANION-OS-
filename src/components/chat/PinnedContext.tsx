"use client";

import Link from "next/link";
import { Pin, ChevronRight } from "lucide-react";

type PinnedContextProps = {
  text: string;
};

/**
 * Slim single-line pinned context strip.
 * Tapping navigates to Settings where the user can edit their context.
 */
export function PinnedContext({ text }: PinnedContextProps) {
  if (!text) return null;

  return (
    <Link
      href="/settings"
      className="group flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-1.5 transition-colors hover:bg-white/[0.04]"
    >
      <Pin className="h-3 w-3 shrink-0 text-tos-gold/70" />
      <span className="flex-1 truncate text-[11px] text-white/50">
        {text}
      </span>
      <ChevronRight className="h-3 w-3 shrink-0 text-white/20 transition-colors group-hover:text-white/40" />
    </Link>
  );
}
