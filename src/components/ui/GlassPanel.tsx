import type { ReactNode } from "react";

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  /** @deprecated Glow is ignored in the monochrome design. Kept for API compat. */
  glow?: "warm" | "cyan" | "none";
  /** Use Linear-style card variant. */
  linear?: boolean;
};

export function GlassPanel({
  children,
  className = "",
  glow: _glow = "none",
  linear = false,
}: GlassPanelProps) {
  if (linear) {
    return (
      <div className={`tos-linear-card p-0 ${className}`}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-[1rem] border border-[color:var(--tos-glass-border)] bg-[var(--tos-bg-elevated)] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] ${className}`}
    >
      {children}
    </div>
  );
}
