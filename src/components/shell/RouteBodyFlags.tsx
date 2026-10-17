"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Mirrors route classes onto <body> for CSS that still keys off body.
 * useLayoutEffect (not useEffect) so the class is applied before paint
 * on client navigations — first load is covered by the boot script and
 * by .tos-route-* on the shell wrapper.
 */
export function RouteBodyFlags() {
  const pathname = usePathname();
  const isChart = pathname === "/chart" || pathname.startsWith("/chart/");
  const isChat = pathname === "/chat" || pathname.startsWith("/chat/");

  useLayoutEffect(() => {
    document.body.classList.toggle("tos-route-chart", isChart);
    document.body.classList.toggle("tos-route-chat", isChat);
    return () => {
      document.body.classList.remove("tos-route-chart");
      document.body.classList.remove("tos-route-chat");
    };
  }, [isChart, isChat]);

  return null;
}
