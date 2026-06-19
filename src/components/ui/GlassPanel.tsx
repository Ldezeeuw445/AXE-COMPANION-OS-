import type { ReactNode, MouseEventHandler } from "react";

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  /** @deprecated Glow is ignored in the monochrome design. Kept for API compat. */
  glow?: "warm" | "cyan" | "none";
  /** Use Linear-style card variant. */
  linear?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
};

export function GlassPanel({
  children,
  className = "",
  glow: _glow = "none",
  linear = true,
  onClick,
}: GlassPanelProps) {
  if (linear) {
    return (
      <div className={`tos-linear-card p-0 ${className}`} onClick={onClick}>
        {children}
      </div>
    );
  }

  return (
    <div className={`tos-matte-surface overflow-hidden rounded-[1rem] ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}
