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
      className={`relative overflow-hidden rounded-[1rem] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] ${className}`}
      style={{
        border: "1px solid transparent",
        background:
          "linear-gradient(var(--tos-bg-elevated), var(--tos-bg-elevated)) padding-box, linear-gradient(to bottom, rgba(255,255,255,0.09), rgba(255,255,255,0.02)) border-box",
      }}
    >
      {children}
    </div>
  );
}
