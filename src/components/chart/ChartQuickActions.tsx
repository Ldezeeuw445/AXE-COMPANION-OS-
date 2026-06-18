"use client";

import { BarChart2, Crosshair, Newspaper, Zap } from "lucide-react";
import { SquawkChip } from "@/components/market/SquawkChip";

const baseBtn =
  "inline-flex items-center justify-center rounded-lg border bg-black/72 text-white/80 shadow-[0_8px_20px_rgba(0,0,0,0.45)] backdrop-blur active:scale-95";
const idle = "border-white/[0.10]";
const activeWhite = "border-white/[0.22] bg-white/[0.08] text-white";

const MT5_SPLIT_BG =
  "linear-gradient(90deg, rgba(34,211,238,0.42) 0%, rgba(34,211,238,0.42) 50%, rgba(225,57,71,0.42) 50%, rgba(225,57,71,0.42) 100%)";
const MT5_SPLIT_ACTIVE =
  "linear-gradient(90deg, rgba(34,211,238,0.62) 0%, rgba(34,211,238,0.62) 50%, rgba(225,57,71,0.62) 50%, rgba(225,57,71,0.62) 100%)";

function ToolbarDivider() {
  return <div className="mx-1.5 h-6 w-px shrink-0 rounded-full bg-white/[0.14]" aria-hidden />;
}

function Mt5SplitButton({
  size,
  glyph,
  active,
  onClick,
  label,
}: {
  size: string;
  glyph: string;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseBtn} ${size} relative overflow-hidden`}
      style={{
        background: active ? MT5_SPLIT_ACTIVE : MT5_SPLIT_BG,
        borderColor: active ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.14)",
        boxShadow: active
          ? "0 0 14px rgba(34,211,238,0.2), 0 0 14px rgba(225,57,71,0.15), inset 0 1px 0 rgba(255,255,255,0.12)"
          : undefined,
      }}
      aria-label={label}
      title={label}
      aria-pressed={active}
    >
      <span
        className="relative z-10 text-[15px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]"
        aria-hidden
      >
        {glyph}
      </span>
    </button>
  );
}

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
  variant = "default",
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
  variant?: "default" | "tablet";
}) {
  const gap = compact ? "gap-1" : "gap-1.5";
  const size = compact ? "h-7 w-7" : "h-8 w-8";
  const icon = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  const tabletSize = "h-8 w-8";

  if (variant === "tablet") {
    return (
      <div className="flex max-w-full shrink-0 items-center justify-center">
        <SquawkChip variant="tablet" />
        <ToolbarDivider />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDepth}
            className={`${baseBtn} ${tabletSize} ${orderBookOpen ? activeWhite : idle}`}
            aria-label="Market depth"
            title="Depth"
            aria-pressed={orderBookOpen}
          >
            <span className="text-[15px] leading-none" aria-hidden>
              📊
            </span>
          </button>
          <button
            type="button"
            onClick={onNews}
            className={`${baseBtn} ${tabletSize} ${newsOpen ? activeWhite : idle}`}
            aria-label="News and intel"
            title="News"
            aria-pressed={newsOpen}
          >
            <span className="text-[15px] leading-none" aria-hidden>
              📰
            </span>
          </button>
        </div>
        <ToolbarDivider />
        <div className="flex items-center gap-1.5">
          <Mt5SplitButton
            size={tabletSize}
            glyph="⚡️"
            active={oneClickVisible && executionMode === "market"}
            onClick={onOneClick}
            label="1-Click Trade"
          />
          <Mt5SplitButton
            size={tabletSize}
            glyph="🛞"
            active={executionMode === "pending" && pendingOrderVisible}
            onClick={onPending}
            label="Limit / Stop order"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex shrink-0 items-center ${gap}`}>
      <button
        type="button"
        onClick={onDepth}
        className={`${baseBtn} ${size} rounded-full ${orderBookOpen ? activeWhite : idle}`}
        aria-label="Market depth"
        title="Market depth"
        aria-pressed={orderBookOpen}
      >
        <BarChart2 className={icon} />
      </button>
      <button
        type="button"
        onClick={onNews}
        className={`${baseBtn} ${size} rounded-full ${newsOpen ? activeWhite : idle}`}
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
        className={`${baseBtn} ${size} rounded-full ${oneClickVisible && executionMode === "market" ? activeWhite : idle}`}
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
        className={`${baseBtn} ${size} rounded-full ${executionMode === "pending" && pendingOrderVisible ? activeWhite : idle}`}
        aria-label="Limit / Stop order"
        title="Limit / Stop order"
        aria-pressed={executionMode === "pending" && pendingOrderVisible}
      >
        <Crosshair className={icon} />
      </button>
    </div>
  );
}
