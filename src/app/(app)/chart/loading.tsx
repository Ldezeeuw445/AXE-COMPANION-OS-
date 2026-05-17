import { AxeBreatheLoader } from "@/components/ui/AxeBreatheLoader";

export default function ChartLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 py-2">
      <div className="h-14 animate-pulse rounded-xl border border-white/[0.05] bg-white/[0.035]" />
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded-md bg-white/[0.05]" />
          <div className="h-3 w-56 animate-pulse rounded bg-white/[0.04]" />
        </div>
        <div className="inline-flex h-6 w-28 animate-pulse items-center justify-center rounded-full border border-cyan-400/18 bg-cyan-400/[0.05] text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100/50">
          Connecting
        </div>
      </div>
      <div className="flex gap-1.5">
        <div className="h-7 w-12 animate-pulse rounded-full bg-white/[0.04]" />
        <div className="h-7 w-12 animate-pulse rounded-full bg-white/[0.04]" />
        <div className="h-7 w-12 animate-pulse rounded-full bg-white/[0.04]" />
        <div className="h-7 w-20 animate-pulse rounded-full bg-white/[0.04]" />
      </div>
      <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#04070C]">
        <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:100%_64px,72px_100%]" />
        <div className="absolute inset-x-0 top-1/2 h-px animate-pulse bg-cyan-300/20" />
        <div className="absolute left-4 top-4 rounded-full border border-cyan-300/18 bg-black/60 px-3 py-1.5 backdrop-blur">
          <AxeBreatheLoader label="Preparing chart" size="sm" />
        </div>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11px] uppercase tracking-[0.18em] text-tos-dim">
          Restoring last stable candles…
        </div>
      </div>
    </div>
  );
}
