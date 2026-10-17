import type { SupabaseClient } from "@supabase/supabase-js";
import {
  learningStage,
  type LearningSignalCounts,
  type LearningStage,
} from "@/lib/axe/learningStage";

/**
 * Count what AXE knows about a trader, now and a month ago.
 *
 * Every number is a row that exists. Nothing is estimated, and a count that
 * cannot be read comes back as zero rather than as a guess — an arc that
 * inflates itself when the database is slow is worth nothing.
 *
 * The "scope" split is what gives AXE and AXE Intel their own arcs: they learn
 * different things about you, and showing one number for both would hide which
 * of the two is actually growing.
 */

export type LearningScope = "axe" | "intel";

const WINDOW_DAYS = 30;

async function countRows(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  opts: { before?: string; notNull?: string; isNull?: string; timeColumn?: string } = {},
): Promise<number> {
  try {
    let q = supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (opts.notNull) q = q.not(opts.notNull, "is", null);
    if (opts.isNull) q = q.is(opts.isNull, null);
    if (opts.before) q = q.lt(opts.timeColumn ?? "created_at", opts.before);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function countsAt(
  supabase: SupabaseClient,
  userId: string,
  scope: LearningScope,
  before?: string,
): Promise<LearningSignalCounts> {
  // AXE Intel learns from what it has noticed and said; it does not journal
  // trades or hold your playbook. Counting those under Intel would make its
  // arc move for reasons that have nothing to do with Intel.
  if (scope === "intel") {
    const [memories, notices] = await Promise.all([
      countRows(supabase, "axe_memory", userId, { isNull: "resolved_at", before }),
      countRows(supabase, "axe_proactive_events", userId, { before }),
    ]);
    return {
      memories,
      journaledTrades: 0,
      rules: 0,
      playbooks: 0,
      proactiveNotices: notices,
    };
  }

  const [memories, journaled, rules, playbooks, notices] = await Promise.all([
    countRows(supabase, "axe_memory", userId, { isNull: "resolved_at", before }),
    countRows(supabase, "trade_journal_labels", userId, {
      notNull: "axe_label",
      before,
      timeColumn: "updated_at",
    }),
    countRows(supabase, "axe_user_rules", userId, { before }),
    countRows(supabase, "axe_strategy_playbooks", userId, { before }),
    countRows(supabase, "axe_proactive_events", userId, { before }),
  ]);

  return {
    memories,
    journaledTrades: journaled,
    rules,
    playbooks,
    proactiveNotices: notices,
  };
}

export async function getLearningGrowth(
  supabase: SupabaseClient,
  userId: string,
  scope: LearningScope = "axe",
): Promise<LearningStage> {
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [now, then] = await Promise.all([
    countsAt(supabase, userId, scope),
    countsAt(supabase, userId, scope, windowStart),
  ]);
  return learningStage(now, then);
}
