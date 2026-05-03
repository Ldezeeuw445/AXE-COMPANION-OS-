import { ExecutionCard } from "@/components/actions/ExecutionCard";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import {
  listExecutionRequests,
  listSetupReviews,
} from "@/services/actionsService";

export default async function ActionsPage() {
  const [executions, setups] = await Promise.all([
    listExecutionRequests(),
    listSetupReviews(),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        title="Actions"
        subtitle="Guarded workflow — you confirm before execution"
      />
      <p className="mb-4 text-xs leading-relaxed text-tos-muted">
        AI prepares trades. You review instrument, direction, entry, stop,
        target, and risk. Nothing executes here until you explicitly approve;
        broker connection arrives later.
      </p>

      <h2 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-tos-dim">
        Pending approvals
      </h2>
      <div className="mb-6 flex flex-col gap-3">
        {executions.map((c) => (
          <ExecutionCard key={c.id} card={c} />
        ))}
      </div>

      <h2 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-tos-dim">
        Setup reviews
      </h2>
      <div className="flex flex-col gap-3">
        {setups.map((s) => (
          <GlassPanel key={s.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-tos-text">
                {s.instrument}
              </span>
              {s.direction === "long" ? (
                <Badge variant="long">Long</Badge>
              ) : s.direction === "short" ? (
                <Badge variant="short">Short</Badge>
              ) : null}
              <Badge variant="warm">{s.status.replace("_", " ")}</Badge>
            </div>
            <p className="mt-2 text-xs text-tos-muted">{s.summary}</p>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
