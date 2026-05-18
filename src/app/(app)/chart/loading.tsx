import { AxeBreatheLoader } from "@/components/ui/AxeBreatheLoader";

export default function ChartLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col py-2">
      <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#04070C] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.08),transparent_42%)]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <AxeBreatheLoader label="Running..." />
          <div className="max-w-xs space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100/80">
              AXE Chart Runtime
            </p>
            <p className="text-xs leading-relaxed text-tos-muted">
              Resolving the active broker symbol, hydrating candles, then waiting for real broker data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
