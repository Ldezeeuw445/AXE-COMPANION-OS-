"use client";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TosNoticeAccent = "cyan" | "amber" | "rose" | "emerald";

const accentDotClass: Record<TosNoticeAccent, string> = {
  cyan: "tos-accent-dot--cyan",
  amber: "tos-accent-dot--amber",
  rose: "tos-accent-dot--rose",
  emerald: "tos-accent-dot--emerald",
};

type TosNoticeProps = {
  title?: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  accent?: TosNoticeAccent;
  className?: string;
  style?: CSSProperties;
  role?: "status" | "alert";
  onDismiss?: () => void;
  dismissLabel?: string;
  /** Inline action next to dismiss (e.g. Settings link) */
  action?: ReactNode;
};

/** Matte black in-app notice — white copy, small accent dot. */
export function TosNotice({
  title,
  body,
  children,
  accent = "cyan",
  className,
  style,
  role = "status",
  onDismiss,
  dismissLabel = "Dismiss",
  action,
}: TosNoticeProps) {
  return (
    <div className={cn("tos-matte-notice", className)} style={style} role={role}>
      <span className={cn("tos-accent-dot mt-1 shrink-0", accentDotClass[accent])} aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="tos-matte-notice-title">{title}</p> : null}
        {body ? <p className="tos-matte-notice-body">{body}</p> : null}
        {children}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="tos-matte-notice-dismiss shrink-0 self-start"
          aria-label={dismissLabel}
        >
          {dismissLabel === "Dismiss" ? <X className="h-3 w-3" /> : dismissLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Compact inline banner (settings panels, forms). */
export function TosMatteBanner({
  children,
  accent = "cyan",
  className,
}: {
  children: ReactNode;
  accent?: TosNoticeAccent;
  className?: string;
}) {
  return (
    <div className={cn("tos-matte-banner", className)}>
      <span className={cn("tos-accent-dot mt-0.5 shrink-0", accentDotClass[accent])} aria-hidden />
      <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-white/78">{children}</div>
    </div>
  );
}
