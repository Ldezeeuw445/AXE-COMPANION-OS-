/**
 * AXE Loader — Premium glossy orb with constellation particles.
 *
 * Inspired by Gleb Kuznetsov's "Trading dark theme loader" (Dribbble).
 * Pure CSS — no Framer Motion or canvas required.
 */

type AxeBreatheLoaderProps = {
  label?: string;
  size?: "sm" | "md";
  tone?: "default" | "gold";
  className?: string;
};

export function AxeBreatheLoader({
  label = "Running...",
  size = "md",
  tone = "default",
  className = "",
}: AxeBreatheLoaderProps) {
  const orbSize = size === "sm" ? 32 : 48;
  const textClass = size === "sm" ? "text-[10px]" : "text-[11px]";
  const labelColor =
    tone === "gold" ? "text-amber-100/85" : "text-white/70";

  return (
    <span
      className={`inline-flex items-center gap-3 ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Orb container */}
      <span
        className="relative shrink-0"
        style={{ width: orbSize, height: orbSize }}
        aria-hidden
      >
        {/* Outer glow ring */}
        <span
          className="absolute inset-[-4px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(0,212,245,0.12) 0%, transparent 70%)",
            animation: "axe-orb-glow 3s ease-in-out infinite",
          }}
        />

        {/* Main glossy sphere */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 30%, rgba(0,212,245,0.06) 60%, rgba(0,0,0,0.4) 100%)",
            boxShadow:
              "0 0 24px -4px rgba(0,212,245,0.15), inset 0 -8px 16px -4px rgba(0,0,0,0.5), inset 0 2px 6px rgba(255,255,255,0.12)",
            animation: "axe-orb-breathe 3s ease-in-out infinite",
          }}
        />

        {/* Iridescent highlight arc */}
        <span
          className="absolute rounded-full"
          style={{
            top: "8%",
            left: "18%",
            width: "60%",
            height: "35%",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(148,163,184,0.08) 50%, transparent 100%)",
            borderRadius: "50%",
            filter: "blur(1px)",
            animation: "axe-orb-shimmer 3s ease-in-out infinite",
          }}
        />

        {/* Constellation dots orbiting */}
        {[0, 60, 120, 180, 240, 300].map((deg, i) => (
          <span
            key={deg}
            className="absolute rounded-full bg-white/60"
            style={{
              width: i % 2 === 0 ? 2 : 1.5,
              height: i % 2 === 0 ? 2 : 1.5,
              top: "50%",
              left: "50%",
              transform: `rotate(${deg}deg) translateY(-${orbSize * 0.58}px) translateX(-50%)`,
              animation: `axe-orb-orbit 8s linear infinite`,
              animationDelay: `${i * -1.33}s`,
              opacity: 0.4 + (i % 3) * 0.2,
            }}
          />
        ))}
      </span>

      {/* Label */}
      {label && (
        <span
          className={`${textClass} font-semibold uppercase tracking-[0.16em] ${labelColor}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}

/** Full loading panel — centered orb + label. */
export function AxeLoadingPanel({
  label = "Restoring live context",
}: {
  label?: string;
}) {
  return (
    <div className="axe-page-enter flex min-h-[180px] items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-8">
      <AxeBreatheLoader label={label} />
    </div>
  );
}
