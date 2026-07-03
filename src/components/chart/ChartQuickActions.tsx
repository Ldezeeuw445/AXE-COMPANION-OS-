"use client";

import { BarChart2, Crosshair, Newspaper, Zap, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SquawkChip } from "@/components/market/SquawkChip";

export const MT5_SPLIT_BG =
  "linear-gradient(90deg, rgba(34,211,238,0.44) 0%, rgba(34,211,238,0.44) 50%, rgba(225,57,71,0.44) 50%, rgba(225,57,71,0.44) 100%)";
export const MT5_SPLIT_ACTIVE =
  "linear-gradient(90deg, rgba(34,211,238,0.64) 0%, rgba(34,211,238,0.64) 50%, rgba(225,57,71,0.64) 50%, rgba(225,57,71,0.64) 100%)";

const baseBtn =
  "inline-flex items-center justify-center border bg-black/78 text-white/85 shadow-[0_4px_14px_rgba(0,0,0,0.4)] backdrop-blur active:scale-[0.97] transition-transform";
const idle = "border-white/[0.10]";
const activeWhite = "border-white/[0.22] bg-white/[0.08] text-white";

function ToolbarDivider() {
  return <div className="mx-1.5 h-6 w-px shrink-0 rounded-full bg-white/[0.14]" aria-hidden />;
}

export function Mt5SplitButton({
  size,
  icon: Icon,
  active,
  onClick,
  label,
  rounded = "rounded-lg",
}: {
  size: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  label: string;
  rounded?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseBtn} ${size} ${rounded} relative overflow-hidden`}
      style={{
        background: active ? MT5_SPLIT_ACTIVE : MT5_SPLIT_BG,
        borderColor: active ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.12)",
        boxShadow: active
          ? "0 0 12px rgba(34,211,238,0.18), 0 0 12px rgba(225,57,71,0.12), inset 0 1px 0 rgba(255,255,255,0.10)"
          : undefined,
      }}
      aria-label={label}
      title={label}
      aria-pressed={active}
    >
      <Icon className="relative z-10 h-3.5 w-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]" />
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
  trailing,
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
  /** Slot after execution buttons — e.g. favorites star */
  trailing?: ReactNode;
}) {
  const gap = compact ? "gap-1" : "gap-1.5";
  const size = compact ? "h-7 w-7" : "h-8 w-8";
  const icon = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  const tabletSize = "h-8 w-8";
  const whiteBtnRound = variant === "tablet" ? "rounded-lg" : "rounded-md";

  if (variant === "tablet") {
    const tabletIcon = "h-3.5 w-3.5";
    return (
      <div className="flex max-w-full shrink-0 items-center justify-center">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDepth}
            className={`${baseBtn} ${tabletSize} ${whiteBtnRound} ${orderBookOpen ? activeWhite : idle}`}
            aria-label="Market depth"
            title="Depth"
            aria-pressed={orderBookOpen}
          >
            <BarChart2 className={tabletIcon} />
          </button>
          <button
            type="button"
            onClick={onNews}
            className={`${baseBtn} ${tabletSize} ${whiteBtnRound} ${newsOpen ? activeWhite : idle}`}
            aria-label="News and intel"
            title="News"
            aria-pressed={newsOpen}
          >
            <Newspaper className={tabletIcon} />
          </button>
        </div>
        <ToolbarDivider />
        <SquawkChip variant="tablet" />
        <ToolbarDivider />
        <div className="flex items-center gap-1.5">
          <Mt5SplitButton
            size={tabletSize}
            icon={Zap}
            active={oneClickVisible && executionMode === "market"}
            onClick={onOneClick}
            label="1-Click Trade"
          />
          <Mt5SplitButton
            size={tabletSize}
            icon={Crosshair}
            active={executionMode === "pending" && pendingOrderVisible}
            onClick={onPending}
            label="Limit / Stop order"
          />
          {trailing ? (
            <>
              <ToolbarDivider />
              {trailing}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex shrink-0 items-center ${gap}`}>
      <button
        type="button"
        onClick={onDepth}
        className={`${baseBtn} ${size} ${whiteBtnRound} ${orderBookOpen ? activeWhite : idle}`}
        aria-label="Market depth"
        title="Market depth"
        aria-pressed={orderBookOpen}
      >
        <BarChart2 className={icon} />
      </button>
      <button
        type="button"
        onClick={onNews}
        className={`${baseBtn} ${size} ${whiteBtnRound} ${newsOpen ? activeWhite : idle}`}
        aria-label="News and intel"
        title="News & intel"
        aria-pressed={newsOpen}
      >
        <Newspaper className={icon} />
      </button>
      <div className="mx-0.5 h-4 w-px rounded-full bg-white/[0.08]" />
      <Mt5SplitButton
        size={size}
        icon={Zap}
        active={oneClickVisible && executionMode === "market"}
        onClick={onOneClick}
        label="1-Click Trade"
      />
      <Mt5SplitButton
        size={size}
        icon={Crosshair}
        active={executionMode === "pending" && pendingOrderVisible}
        onClick={onPending}
        label="Limit / Stop order"
      />
      {trailing ? (
        <>
          <div className="mx-0.5 h-4 w-px rounded-full bg-white/[0.08]" />
          {trailing}
        </>
      ) : null}
    </div>
  );
}
