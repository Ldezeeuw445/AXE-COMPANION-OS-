import { detectActionRuntime, buildWorkflowRuntime } from "@/lib/workflows/runtime";
import { getFavoriteWorkflowIdsServerState } from "@/lib/workflows/serverFavorites";
import {
  getEodhdKey,
  getFinnhubKey,
  getFredKey,
  getPerigonKey,
} from "@/lib/market/providerStatus";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { ExecutionCard } from "@/components/actions/ExecutionCard";
import { AxeWorkflowsHub } from "@/components/actions/AxeWorkflowsHub";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import {
  listExecutionRequests,
  listSetupReviews,
} from "@/services/actionsService";
import { getTradeExecutionPrefsServerState } from "@/lib/trading/serverTradePrefs";
import { ChevronDown } from "lucide-react";

export default async function ActionsPage() {
  const [executions, setups, runtime, tradePrefs, favoriteIds] = await Promise.all([
    listExecutionRequests(),
    listSetupReviews(),
    detectActionRuntime(),
    getTradeExecutionPrefsServerState(),
    getFavoriteWorkflowIdsServerState(),
  ]);

  const hasNews = Boolean(getPerigonKey() || getFinnhubKey() || getEodhdKey());
  const hasMacro = Boolean(getFredKey()) || hasNews;
  const workflowRuntime = buildWorkflowRuntime(runtime, hasNews, hasMacro);

  const capabilities = (runtime.hasActiveAccount ? 1 : 0) + (hasNews ? 1 : 0) + (hasMacro ? 1 : 0);

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
      <LiveStatusReporter
        liveCount={capabilities}
        totalCount={3}
        label={`Actions · ${executions.length + setups.length} pending`}
        allLiveOverride={capabilities > 0 ? false : null}
      />
      <PageTitleInjector title="Actions" />

      <AxeWorkflowsHub runtime={workflowRuntime} favoriteIds={favoriteIds} />

      <details
        className="group mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0d]/90"
        open={executions.length > 0 || setups.length > 0}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-tos-muted [&::-webkit-details-marker]:hidden">
          Reviews & approvals
          <ChevronDown className="h-4 w-4 shrink-0 text-tos-dim transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-4 border-t border-white/[0.05] px-4 py-4">
          <p className="text-xs leading-relaxed text-tos-muted">
            AI prepares trades and setup reviews. You review instrument, direction, entry, stop, target and risk.
            Nothing executes here until you explicitly approve and a broker bridge is enabled.
          </p>

          {executions.length > 0 ? (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                Pending approvals
              </h3>
              <div className="flex flex-col gap-3">
                {executions.map((c) => (
                  <ExecutionCard key={c.id} card={c} defaultVolume={tradePrefs.defaultVolume} />
                ))}
              </div>
            </section>
          ) : null}

          {setups.length > 0 ? (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
                Setup reviews
              </h3>
              <div className="flex flex-col gap-3">
                {setups.map((s) => (
                  <GlassPanel key={s.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-tos-text">{s.instrument}</span>
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
            </section>
          ) : null}

          {executions.length === 0 && setups.length === 0 ? (
            <p className="text-[11px] text-tos-dim">
              No pending reviews. Items appear here when AXE drafts a trade ticket or a setup review for you to approve.
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
