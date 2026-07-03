"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Sets body classes for route-specific CSS (e.g. chart landscape chrome hide).
 */
export function RouteBodyFlags() {
  const pathname = usePathname();
  const isChart = pathname === "/chart" || pathname.startsWith("/chart/");

  useEffect(() => {
    document.body.classList.toggle("tos-route-chart", isChart);
    const isChat = pathname === "/chat" || pathname.startsWith("/chat/");
    document.body.classList.toggle("tos-route-chat", isChat);
    return () => {
      document.body.classList.remove("tos-route-chart");
      document.body.classList.remove("tos-route-chat");
    };
  }, [isChart, pathname]);

  return null;
}
