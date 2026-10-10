import type { NextRequest } from "next/server";
import { hasCronSecret } from "@/lib/auth/cronSecret";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { autoJournalTrades } from "@/services/journalingService";
import { llmFailureAdvice } from "@/lib/ops/llmFailure";
import { refreshWeakSpots } from "@/services/weakSpotService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Journal sweep — the catch-up pass that makes "AXE journals by itself" true.
 *
 * The post-sync trigger in `syncCloudAccount` only fires when MT5 sync runs and
 * succeeds. Anything that closed while sync was broken (a deleted MetaApi
 * account, an expired token, a model outage) stayed unjournaled forever,
 * because nothing ever looked back. This does.
 *
 * Secured with CRON_SECRET. Scheduled hourly via pg_cron — see docs/CRON-RUNBOOK.md.
 */

/** Hard ceiling so one sweep cannot run away with the model budget. */
const MAX_ACCOUNTS = 40;

export async function GET(request: NextRequest) {
  if (!hasCronSecret(request.headers)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    return Response.json({ error: "supabase_service_role_missing" }, { status: 503 });
  }

  const startedAt = Date.now();

  // Closed trades from the last 7 days that carry no AXE label yet. Looking at
  // the trades (not the accounts) means an account nobody synced today still
  // gets swept.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: trades, error } = await supabase
    .from("broker_trades")
    .select("user_id,account_id,id")
    .not("close_time", "is", null)
    .gte("close_time", since)
    .order("close_time", { ascending: false })
    .limit(500);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { data: labeled } = await supabase
    .from("trade_journal_labels")
    .select("trade_id")
    .not("axe_label", "is", null)
    .limit(2000);
  const labeledIds = new Set((labeled ?? []).map((l: { trade_id: string }) => l.trade_id));

  // One entry per (user, account) that still owes AXE a journal.
  const pending = new Map<string, { userId: string; accountId: string; trades: number }>();
  for (const t of trades ?? []) {
    if (labeledIds.has(t.id as string)) continue;
    const userId = t.user_id as string | null;
    const accountId = t.account_id as string | null;
    if (!userId || !accountId) continue;
    const key = `${userId}:${accountId}`;
    const existing = pending.get(key);
    if (existing) existing.trades += 1;
    else pending.set(key, { userId, accountId, trades: 1 });
  }

  const targets = [...pending.values()].slice(0, MAX_ACCOUNTS);

  let journaled = 0;
  let failedAccounts = 0;
  let weakSpotsWritten = 0;
  const blockers: Array<{ reason: string; advice: string }> = [];

  for (const target of targets) {
    const result = await autoJournalTrades(
      supabase,
      target.userId,
      target.accountId,
      undefined,
      "journal_sweep",
    );

    if (result.ok) {
      journaled += result.journaled;
      // Re-read the account's behaviour now the labels are current. This runs
      // on arithmetic, not on a model, so it keeps producing insight even when
      // the journaling above could not score a single trade.
      try {
        const refresh = await refreshWeakSpots(supabase, target.userId, target.accountId);
        weakSpotsWritten += refresh.written;
      } catch (err) {
        console.error("[journal-sweep] weak-spot refresh failed:", err);
      }
      continue;
    }

    failedAccounts += 1;
    const reason = result.reason ?? "unknown";
    if (!blockers.some((b) => b.reason === reason)) {
      blockers.push({ reason, advice: result.advice ?? llmFailureAdvice("unknown") });
    }
    // A failure only an operator can clear will hit every remaining account the
    // same way. Stop here instead of logging it forty times.
    if (reason === "no_credits" || reason === "auth_failed" || reason === "not_configured") {
      break;
    }
  }

  return Response.json({
    ok: blockers.length === 0,
    accountsPending: pending.size,
    accountsProcessed: targets.length,
    journaled,
    weakSpotsWritten,
    failedAccounts,
    blockers,
    latency_ms: Date.now() - startedAt,
  });
}
