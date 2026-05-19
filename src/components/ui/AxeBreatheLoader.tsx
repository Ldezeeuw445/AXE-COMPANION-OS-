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
  const dot = size === "sm" ? "h-1 w-1" : "h-1.5 w-1.5";
  const text = size === "sm" ? "text-[10px]" : "text-[11px]";
  const dotClass =
    tone === "gold"
      ? "bg-tos-warm/90 shadow-[0_0_8px_rgba(244,183,86,0.40)]"
      : "bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.20)]";
  const textClass = tone === "gold" ? "text-amber-100/85" : "text-white/70";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-2.5 py-1.5 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="grid grid-cols-3 gap-0.5" aria-hidden>
        {Array.from({ length: 9 }).map((_, idx) => (
          <span
            key={idx}
            className={`${dot} rounded-full ${dotClass} animate-pulse`}
            style={{ animationDelay: `${idx * 70}ms`, opacity: 0.35 + (idx % 3) * 0.18 }}
          />
        ))}
      </span>
      <span className={`${text} font-semibold uppercase tracking-[0.16em] ${textClass}`}>{label}</span>
    </span>
  );
}

export function AxeLoadingPanel({ label = "Restoring live context" }: { label?: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-8">
      <AxeBreatheLoader label={label} />
    </div>
  );
}
