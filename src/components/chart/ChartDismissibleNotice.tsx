"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "axe.chart.dismissedNotices";

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissed(set: Set<string>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function useChartDismissedNotices() {
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());

  const dismiss = useCallback((key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      writeDismissed(next);
      return next;
    });
  }, []);

  const isDismissed = useCallback((key: string) => dismissed.has(key), [dismissed]);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  return { dismiss, isDismissed };
}

export function ChartDismissibleNotice({
  noticeKey,
  children,
  tone = "muted",
  className = "",
  bottomOffset = "0.75rem",
  stackIndex = 0,
  dismissed,
  onDismiss,
}: {
  noticeKey: string;
  children: React.ReactNode;
  tone?: "muted" | "amber";
  className?: string;
  /** Base lift from chart bottom — CSS length e.g. "3.25rem" */
  bottomOffset?: string;
  /** Stack additional notices upward */
  stackIndex?: number;
  dismissed: boolean;
  onDismiss: (key: string) => void;
}) {
  if (dismissed) return null;

  const toneClass =
    tone === "amber"
      ? "border-amber-300/20 text-amber-100/90"
      : "border-white/10 text-tos-muted";

  return (
    <div
      className={`pointer-events-auto absolute right-3 z-30 max-w-[min(18rem,calc(100%-1.5rem))] rounded-xl border bg-black/84 px-3 py-2 pr-8 text-[10.5px] leading-snug shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur ${toneClass} ${className}`}
      style={{
        bottom: `calc(${bottomOffset} + ${stackIndex * 4.75}rem + env(safe-area-inset-bottom, 0px))`,
      }}
      role="status"
    >
      {children}
      <button
        type="button"
        onClick={() => onDismiss(noticeKey)}
        className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white/80"
        aria-label="Dismiss notice"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
