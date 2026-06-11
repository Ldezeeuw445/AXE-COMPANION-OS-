"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Client wrapper for the main content area.
 *
 * Viewport-locked pages (chat, chart) don't get the navbar-clearance
 * padding — they manage their own flex layout and bottom spacing.
 * All other pages get the padding so content isn't hidden behind the
 * fixed navbar.
 */
const FLUSH_ROUTES = ["/chat", "/chart"];

export function ContentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const flush = FLUSH_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );

  return (
    <div
      className={`flex min-h-0 min-w-0 max-w-full flex-1 flex-col px-4 pt-0 md:px-6 md:pt-[max(0.75rem,env(safe-area-inset-top))] ${
        flush
          ? "overflow-hidden"
          : "tos-app-content overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
      }`}
    >
      {children}
    </div>
  );
}
