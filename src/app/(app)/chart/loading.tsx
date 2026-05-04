export default function ChartLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 py-2">
      <div className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded-md bg-white/[0.05]" />
          <div className="h-3 w-56 animate-pulse rounded bg-white/[0.04]" />
        </div>
        <div className="h-6 w-20 animate-pulse rounded-full bg-white/[0.04]" />
      </div>
      <div className="flex gap-1.5">
        <div className="h-7 w-12 animate-pulse rounded-full bg-white/[0.04]" />
        <div className="h-7 w-12 animate-pulse rounded-full bg-white/[0.04]" />
        <div className="h-7 w-12 animate-pulse rounded-full bg-white/[0.04]" />
        <div className="h-7 w-20 animate-pulse rounded-full bg-white/[0.04]" />
      </div>
      <div className="relative min-h-[320px] flex-1 animate-pulse overflow-hidden rounded-2xl border border-white/[0.06] bg-[#04070C]">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11px] uppercase tracking-[0.18em] text-tos-dim">
          Loading MT5 candles…
        </div>
      </div>
    </div>
  );
}
