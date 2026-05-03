import { GlassPanel } from "@/components/ui/GlassPanel";

type Props = {
  metricKeysSample: string[];
};

export function CockpitFooterNote({ metricKeysSample }: Props) {
  return (
    <GlassPanel className="border-tos-warm/20 bg-tos-elevated/40 p-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
        Private snapshot
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-tos-muted">
        When your workspace is live, this view refreshes quietly — same calm
        layout, your numbers underneath. Nothing here is a public scoreboard.
      </p>
      <p className="mt-3 text-[10px] leading-relaxed text-tos-dim">
        <span className="text-tos-dim/90">Internal rollups</span>
        <span className="mx-1.5 text-tos-border">·</span>
        <span className="font-mono text-[9px] text-tos-dim/80">
          {metricKeysSample.join(" · ")}
        </span>
      </p>
    </GlassPanel>
  );
}
