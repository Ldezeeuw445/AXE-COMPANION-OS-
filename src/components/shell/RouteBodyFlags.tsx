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
    return () => document.body.classList.remove("tos-route-chart");
  }, [isChart]);

  return null;
}
