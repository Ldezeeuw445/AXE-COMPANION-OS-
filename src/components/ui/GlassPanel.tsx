import type { ReactNode } from "react";

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  glow?: "warm" | "cyan" | "none";
  /** Use Linear-style card variant. */
  linear?: boolean;
};

export function GlassPanel({
  children,
  className = "",
  glow = "none",
  linear = false,
}: GlassPanelProps) {
  if (linear) {
    return (
      <div className={`tos-linear-card p-0 ${className}`}>
        {children}
      </div>
    );
  }

  /* Glow prop still accepted for API compat, but rendered very subtly. */
  const borderExtra =
    glow === "cyan"
      ? "border-[rgba(0,212,245,0.10)]"
      : "border-[color:var(--tos-glass-border)]";

  return (
    <div
      className={`relative overflow-hidden rounded-[1rem] border ${borderExtra} bg-[var(--tos-bg-elevated)] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] ${className}`}
    >
      {children}
    </div>
  );
}
