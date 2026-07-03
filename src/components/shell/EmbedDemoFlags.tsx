"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { ChartThemeKey } from "@/components/chart/chartTheme";
import { writeChartThemeKey } from "@/components/chart/chartTheme";

/** Marks embed demo iframes so chrome matches phone/tablet shell inside device mocks. */
export function EmbedDemoFlags() {
  const params = useSearchParams();
  const embed = params.get("embed") === "1" || params.get("demo") === "1";
  const embedDevice = params.get("embedDevice") ?? params.get("device");
  const chartTheme = params.get("chartTheme");

  useEffect(() => {
    document.body.classList.toggle("axe-embed-demo", embed);
    document.documentElement.classList.toggle("axe-embed-demo", embed);
    document.body.classList.toggle("axe-embed-phone", embed && embedDevice === "phone");
    document.body.classList.toggle("axe-embed-tablet", embed && embedDevice === "tablet");
    document.body.classList.toggle("tos-tablet-device", embed && embedDevice === "tablet");
    document.body.classList.toggle("tos-tablet-landscape", embed && embedDevice === "tablet");
    document.body.classList.remove("tos-tablet-portrait");
    return () => {
      document.body.classList.remove(
        "axe-embed-demo",
        "axe-embed-phone",
        "axe-embed-tablet",
        "tos-tablet-device",
        "tos-tablet-landscape",
        "tos-tablet-portrait",
      );
      document.documentElement.classList.remove("axe-embed-demo");
    };
  }, [embed, embedDevice]);

  useEffect(() => {
    if (!embed || !chartTheme) return;
    const allowed = new Set<ChartThemeKey>(["midnight", "charcoal", "slate", "paper"]);
    if (allowed.has(chartTheme as ChartThemeKey)) {
      writeChartThemeKey(chartTheme as ChartThemeKey);
    }
  }, [embed, chartTheme]);

  return null;
}
