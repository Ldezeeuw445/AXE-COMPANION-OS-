import type { ReactNode } from "react";

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  glow?: "warm" | "none";
};

export function GlassPanel({
  children,
  className = "",
  glow = "none",
}: GlassPanelProps) {
  const elevation =
    glow === "warm"
      ? "shadow-[var(--tos-shadow-float),0_0_0_1px_rgba(255,255,255,0.04),0_0_40px_-28px_rgba(46,196,182,0.14),inset_0_1px_0_rgba(255,255,255,0.07)]"
      : "shadow-[var(--tos-shadow-float),inset_0_1px_0_rgba(255,255,255,0.06)]";
  return (
    <div
      className={`relative overflow-hidden rounded-[1.35rem] border border-[color:var(--tos-glass-border)] bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent backdrop-blur-xl ${elevation} ${className}`}
    >
      {glow === "warm" ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 via-tos-warm/25 via-tos-gold/15 to-transparent"
          aria-hidden
        />
      ) : null}
      {children}
    </div>
  );
}
