"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { ChartThemeKey } from "@/components/chart/chartTheme";
import { writeChartThemeKey } from "@/components/chart/chartTheme";

/** Marks embed demo iframes so chrome can tighten and parent pages can frame routes. */
export function EmbedDemoFlags() {
  const params = useSearchParams();
  const embed = params.get("embed") === "1" || params.get("demo") === "1";
  const chartTheme = params.get("chartTheme");

  useEffect(() => {
    document.body.classList.toggle("axe-embed-demo", embed);
    document.documentElement.classList.toggle("axe-embed-demo", embed);
    return () => {
      document.body.classList.remove("axe-embed-demo");
      document.documentElement.classList.remove("axe-embed-demo");
    };
  }, [embed]);

  useEffect(() => {
    if (!embed || !chartTheme) return;
    const allowed = new Set<ChartThemeKey>(["midnight", "charcoal", "slate", "paper"]);
    if (allowed.has(chartTheme as ChartThemeKey)) {
      writeChartThemeKey(chartTheme as ChartThemeKey);
    }
  }, [embed, chartTheme]);

  return null;
}
