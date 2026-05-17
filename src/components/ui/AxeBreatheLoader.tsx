type AxeBreatheLoaderProps = {
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

export function AxeBreatheLoader({
  label = "AXE is syncing",
  size = "md",
  className = "",
}: AxeBreatheLoaderProps) {
  const dot = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  const text = size === "sm" ? "text-[10px]" : "text-[11px]";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status" aria-live="polite">
      <span className="inline-flex items-center gap-1" aria-hidden>
        <span className={`${dot} animate-pulse rounded-full bg-cyan-300/90 shadow-[0_0_10px_rgba(103,232,249,0.6)]`} />
        <span className={`${dot} animate-pulse rounded-full bg-cyan-200/75 shadow-[0_0_10px_rgba(103,232,249,0.45)] [animation-delay:160ms]`} />
        <span className={`${dot} animate-pulse rounded-full bg-tos-warm/80 shadow-[0_0_10px_rgba(244,183,86,0.45)] [animation-delay:320ms]`} />
      </span>
      <span className={`${text} font-semibold uppercase tracking-[0.16em] text-cyan-100/80`}>{label}</span>
    </span>
  );
}

export function AxeLoadingPanel({ label = "Restoring live context" }: { label?: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-cyan-300/12 bg-cyan-400/[0.035] px-5 py-8">
      <AxeBreatheLoader label={label} />
    </div>
  );
}
