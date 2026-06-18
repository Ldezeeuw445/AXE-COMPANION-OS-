"use client";

import { BarChart2, Crosshair, Newspaper, Zap } from "lucide-react";

const baseBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-full border bg-black/72 text-white/80 shadow-[0_8px_20px_rgba(0,0,0,0.45)] backdrop-blur active:scale-95";
const idle = "border-white/[0.10]";
const active = "border-white/[0.18] bg-white/[0.06] text-white";

export function ChartQuickActions({
  orderBookOpen,
  newsOpen,
  oneClickVisible,
  executionMode,
  pendingOrderVisible,
  onDepth,
  onNews,
  onOneClick,
  onPending,
  compact = false,
}: {
  orderBookOpen: boolean;
  newsOpen: boolean;
  oneClickVisible: boolean;
  executionMode: "market" | "pending";
  pendingOrderVisible: boolean;
  onDepth: () => void;
  onNews: () => void;
  onOneClick: () => void;
  onPending: () => void;
  compact?: boolean;
}) {
  const gap = compact ? "gap-1" : "gap-1.5";
  const size = compact ? "h-7 w-7" : "h-8 w-8";
  const icon = compact ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <div className={`flex shrink-0 items-center ${gap}`}>
      <button
        type="button"
        onClick={onDepth}
        className={`${baseBtn} ${size} ${orderBookOpen ? active : idle}`}
        aria-label="Market depth"
        title="Market depth"
        aria-pressed={orderBookOpen}
      >
        <BarChart2 className={icon} />
      </button>
      <button
        type="button"
        onClick={onNews}
        className={`${baseBtn} ${size} ${newsOpen ? active : idle}`}
        aria-label="News and intel"
        title="News & intel"
        aria-pressed={newsOpen}
      >
        <Newspaper className={icon} />
      </button>
      <div className="mx-0.5 h-4 w-px rounded-full bg-white/[0.08]" />
      <button
        type="button"
        onClick={onOneClick}
        className={`${baseBtn} ${size} ${oneClickVisible && executionMode === "market" ? active : idle}`}
        style={
          oneClickVisible && executionMode === "market"
            ? { borderColor: "rgba(0,212,245,0.35)", boxShadow: "0 0 10px rgba(0,212,245,0.18)" }
            : undefined
        }
        aria-label="1-Click Trade"
        title="1-Click Trade"
        aria-pressed={oneClickVisible && executionMode === "market"}
      >
        <Zap
          className={icon}
          style={oneClickVisible && executionMode === "market" ? { color: "#00d4f5" } : undefined}
        />
      </button>
      <button
        type="button"
        onClick={onPending}
        className={`${baseBtn} ${size} ${executionMode === "pending" && pendingOrderVisible ? active : idle}`}
        aria-label="Limit / Stop order"
        title="Limit / Stop order"
        aria-pressed={executionMode === "pending" && pendingOrderVisible}
      >
        <Crosshair className={icon} />
      </button>
    </div>
  );
}
