"use client";

import { ChevronUp } from "lucide-react";
import { useTabletNavCollapse, useTabletNavSwipe } from "@/components/shell/TabletNavCollapse";

/** Slim handle when tablet bottom nav is hidden — swipe up or tap to restore. */
export function TabletNavPeekHandle() {
  const { enabled, collapsed, expand } = useTabletNavCollapse();
  const swipe = useTabletNavSwipe("expand", expand);

  if (!enabled || !collapsed) return null;

  return (
    <button
      type="button"
      className="tos-tablet-nav-peek fixed left-1/2 z-[56] flex -translate-x-1/2 flex-col items-center gap-0.5 rounded-t-2xl border border-b-0 border-white/10 bg-[#121214]/92 px-8 py-1.5 shadow-[0_-8px_28px_rgba(0,0,0,0.45)] backdrop-blur-xl active:bg-white/[0.06]"
      style={{ bottom: "max(0px, env(safe-area-inset-bottom, 0px))" }}
      aria-label="Swipe up to show navigation"
      onClick={expand}
      {...swipe}
    >
      <span className="h-1 w-10 rounded-full bg-white/25" aria-hidden />
      <ChevronUp className="h-3.5 w-3.5 text-white/45" strokeWidth={2} aria-hidden />
      <span className="text-[8px] font-medium uppercase tracking-[0.14em] text-white/35">Nav</span>
    </button>
  );
}
