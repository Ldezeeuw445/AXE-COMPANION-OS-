"use client";

import { useState, useCallback } from "react";
import {
  CHART_THEME_KEYS,
  getChartTheme,
  readChartThemeKey,
  writeChartThemeKey,
  readGridStyle,
  writeGridStyle,
  type ChartThemeKey,
  type ChartGridStyle,
} from "@/components/chart/chartTheme";

/**
 * Visual chart theme picker — 4 swatches showing each preset's background + candle
 * colors. Includes a grid/solid toggle. Writes to localStorage immediately;
 * optionally persists to Supabase.
 */
export function ChartThemeSelector() {
  const [active, setActive] = useState<ChartThemeKey>(() => readChartThemeKey());
  const [gridStyle, setGridStyleState] = useState<ChartGridStyle>(() => readGridStyle());

  const select = useCallback((key: ChartThemeKey) => {
    writeChartThemeKey(key);
    setActive(key);
    // Also persist to Supabase (fire-and-forget)
    fetch("/api/preferences/chart-theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: key }),
      credentials: "include",
    }).catch(() => {});
  }, []);

  const toggleGrid = useCallback(() => {
    const next: ChartGridStyle = gridStyle === "grid" ? "solid" : "grid";
    writeGridStyle(next);
    setGridStyleState(next);
  }, [gridStyle]);

  return (
    <div className="flex flex-col gap-3">
      {/* Theme swatches */}
      <div className="flex gap-3">
        {CHART_THEME_KEYS.map((key) => {
          const t = getChartTheme(key);
          const isActive = key === active;
          return (
            <button
              key={key}
              onClick={() => select(key)}
              className={`group relative flex flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 transition-all ${
                isActive
                  ? "border-cyan-400/50 bg-white/[0.06] shadow-[0_0_12px_rgba(0,229,255,0.12)]"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
              }`}
              aria-label={`${t.label} chart theme`}
              aria-pressed={isActive}
            >
              {/* Mini chart preview */}
              <div
                className="flex h-8 w-12 items-end justify-center gap-[2px] rounded-md"
                style={{ background: t.chartCanvasBackground, boxShadow: t.frameGlow }}
              >
                {/* 5 mini candles */}
                <MiniCandle color={t.bull} height={14} />
                <MiniCandle color={t.bear} height={10} />
                <MiniCandle color={t.bull} height={18} />
                <MiniCandle color={t.bear} height={8} />
                <MiniCandle color={t.bull} height={12} />
              </div>
              <span
                className={`text-[9px] font-semibold uppercase tracking-wider ${
                  isActive ? "text-cyan-400" : "text-white/40 group-hover:text-white/60"
                }`}
              >
                {t.label}
              </span>
              {/* Active dot */}
              {isActive && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,229,255,0.6)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Grid / Solid toggle */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
          Grid
        </span>
        <button
          type="button"
          onClick={toggleGrid}
          className={`relative flex h-6 w-11 items-center rounded-full border transition-colors ${
            gridStyle === "grid"
              ? "border-cyan-400/40 bg-cyan-400/20"
              : "border-white/10 bg-white/[0.04]"
          }`}
          aria-label={`Grid: ${gridStyle}`}
          aria-pressed={gridStyle === "grid"}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full transition-transform ${
              gridStyle === "grid"
                ? "translate-x-[22px] bg-cyan-400"
                : "translate-x-[3px] bg-white/40"
            }`}
          />
        </button>
        <span className="text-[10px] uppercase tracking-wider text-white/30">
          {gridStyle === "grid" ? "Gridlines" : "Solid"}
        </span>
      </div>
    </div>
  );
}

function MiniCandle({ color, height }: { color: string; height: number }) {
  return (
    <div
      className="w-[4px] rounded-[1px]"
      style={{ background: color, height: `${height}px` }}
    />
  );
}
