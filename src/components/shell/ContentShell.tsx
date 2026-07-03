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
  const isChartRoute = pathname === "/chart" || pathname.startsWith("/chart/");
  const flush = FLUSH_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
  const horizontalPad = isChartRoute ? "px-0" : "px-4";

  return (
    <div
      className={`flex min-h-0 min-w-0 max-w-full flex-1 flex-col ${horizontalPad} pt-0 tos-shell-desktop-content ${
        flush ? "tos-flush-route" : ""
      } ${isChartRoute ? "tos-chart-route" : ""} ${
        flush
          ? isChartRoute
            ? "overflow-hidden pb-[calc(var(--tos-nav-offset)-0.24rem)]"
            : "overflow-hidden pb-[var(--tos-nav-offset)]"
          : "tos-app-content overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
      }`}
    >
      {children}
    </div>
  );
}
