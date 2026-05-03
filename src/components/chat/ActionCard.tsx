import type { ActionCardPayload } from "@/types/domain";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";

type ActionCardProps = {
  card: ActionCardPayload;
};

export function ActionCard({ card }: ActionCardProps) {
  return (
    <GlassPanel className="mt-3 border-white/[0.08] px-3 py-3 ring-1 ring-white/[0.06] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.5)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-tos-text">{card.title}</p>
        <Badge variant="warm">
          {card.kind === "execution_preview"
            ? "Review"
            : card.kind === "setup_review"
              ? "Setup"
              : "Digest"}
        </Badge>
      </div>
      <dl className="mt-3 space-y-1.5">
        {card.lines.map((row) => (
          <div
            key={row.label}
            className="flex justify-between gap-3 text-xs"
          >
            <dt className="shrink-0 text-tos-dim">{row.label}</dt>
            <dd className="text-right font-mono text-tos-text">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[10px] leading-relaxed text-tos-dim">
        No execution without your explicit confirm. TradingOS terminal policy
        applies.
      </p>
    </GlassPanel>
  );
}
