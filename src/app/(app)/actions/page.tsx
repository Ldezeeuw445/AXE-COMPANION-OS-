import { ChevronDown } from "lucide-react";
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
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getEodhdKey,
  getFinnhubKey,
  getFredKey,
  getPerigonKey,
} from "@/lib/market/providerStatus";

type ActionRuntime = {
  hasActiveAccount: boolean;
  hasOpenPositions: boolean;
  hasTradeHistory: boolean;
  hasJournal: boolean;
  hasMemory: boolean;
};

async function detectActionRuntime(): Promise<ActionRuntime> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { hasActiveAccount: false, hasOpenPositions: false, hasTradeHistory: false, hasJournal: false, hasMemory: false };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { hasActiveAccount: false, hasOpenPositions: false, hasTradeHistory: false, hasJournal: false, hasMemory: false };
  }
  const { data } = await supabase
    .from("user_broker_accounts")
    .select("id,connection_method,external_connection_id,provider_status")
    .eq("user_id", user.id)
    .eq("connection_method", "cloud_mt5")
    .not("external_connection_id", "is", null)
    .limit(1);
  const activeAccount = Array.isArray(data)
    ? data.find((a) => ["connected", "provisioned"].includes(String(a.provider_status ?? "").toLowerCase())) ?? data[0]
    : null;
  const accountId = activeAccount?.id as string | undefined;
  const [positions, trades, journal, memory] = await Promise.all([
    accountId
      ? supabase.from("mt5_positions").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("account_id", accountId)
      : Promise.resolve({ count: 0 }),
    accountId
      ? supabase.from("broker_trades").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("account_id", accountId)
      : Promise.resolve({ count: 0 }),
    supabase.from("user_journal_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("assistant_memory_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  return {
    hasActiveAccount: Boolean(activeAccount),
    hasOpenPositions: (positions.count ?? 0) > 0,
    hasTradeHistory: (trades.count ?? 0) > 0,
    hasJournal: (journal.count ?? 0) > 0,
    hasMemory: (memory.count ?? 0) > 0,
  };
}

export default async function ActionsPage() {
  const [executions, setups, runtime] = await Promise.all([
    listExecutionRequests(),
    listSetupReviews(),
    detectActionRuntime(),
  ]);

  // Headlines / curated news come from Perigon, Finnhub, EODHD. Macro time
  // series (rates, yields, CPI prints) come from FRED. Whichever set is
  // configured flips the "Needs news / Needs macro" gates on the workflow
  // tiles so traders aren't stuck behind cosmetic badges.
  const hasNews = Boolean(getPerigonKey() || getFinnhubKey() || getEodhdKey());
  const hasMacro = Boolean(getFredKey()) || hasNews;

  // Pulse: green when both Supabase reads delivered and we have at
  // least one capability (active MT5 account, news, or macro).
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

      <AxeWorkflowsHub
        hasActiveAccount={runtime.hasActiveAccount}
        hasOpenPositions={runtime.hasOpenPositions}
        hasTradeHistory={runtime.hasTradeHistory}
        hasJournal={runtime.hasJournal}
        hasMemory={runtime.hasMemory}
        hasNews={hasNews}
        hasMacro={hasMacro}
      />

      {/* Existing review pipelines moved into a folded section so the hub owns the page */}
      <details className="group mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0d]/90">
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
                  <ExecutionCard key={c.id} card={c} />
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
