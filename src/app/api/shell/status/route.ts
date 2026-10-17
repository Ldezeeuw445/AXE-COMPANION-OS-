import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { brokerPricingState, type RuntimeTruthState } from "@/lib/runtime/runtimeTruth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shell/status — what the bottom nav shows about your account.
 *
 * One call for the whole shell: the live-data state behind the hairline, plus
 * the two counts worth interrupting someone for. Everything here is derived
 * from rows that already exist; nothing is invented, and anything that cannot
 * be established honestly comes back null so the nav shows nothing rather than
 * a number that might be stale.
 */

const POSITIONS_MAX_AGE_MS = 10 * 60_000;
const TRIGGERED_WINDOW_MS = 24 * 60 * 60_000;

export type ShellStatus = {
  /** live | degraded | warming | unavailable | inactive */
  runtime: RuntimeTruthState;
  /** Open positions on the active account, or null when not knowable now. */
  positions: number | null;
  /** Alerts that fired in the last 24h. */
  alertsTriggered: number;
};

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json(inactive(), { headers: noStore });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(inactive(), { status: 401, headers: noStore });

  const { data: prefs } = await supabase
    .from("user_workspace_preferences")
    .select("active_account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const activeId = (prefs?.active_account_id as string | null | undefined) ?? null;

  const [snapshotRes, alertsRes] = await Promise.all([
    activeId
      ? supabase
          .from("chart_live_snapshots")
          .select("last_tick_at,last_candle_at,updated_at,status,open_positions_count")
          .eq("user_id", user.id)
          .eq("account_id", activeId)
          .order("updated_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null }),
    supabase
      .from("user_alerts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "triggered")
      .gte("triggered_at", new Date(Date.now() - TRIGGERED_WINDOW_MS).toISOString()),
  ]);

  const row = (snapshotRes.data?.[0] ?? null) as Record<string, unknown> | null;

  const state: RuntimeTruthState = !activeId
    ? "inactive"
    : row
      ? brokerPricingState({
          status: row.status as string | null,
          updatedAt: row.updated_at as string | null,
          lastTickAt: row.last_tick_at as string | null,
          lastCandleAt: row.last_candle_at as string | null,
        })
      : "warming";

  // A count from a stale snapshot is worse than no count: it would claim open
  // risk that may have been closed since.
  const updatedAt = row?.updated_at ? Date.parse(String(row.updated_at)) : NaN;
  const positionsFresh = Number.isFinite(updatedAt) && Date.now() - updatedAt < POSITIONS_MAX_AGE_MS;
  const positions =
    positionsFresh && row?.open_positions_count != null ? Number(row.open_positions_count) : null;

  return NextResponse.json(
    {
      runtime: state,
      positions,
      alertsTriggered: alertsRes.count ?? 0,
    } satisfies ShellStatus,
    { headers: noStore },
  );
}

const noStore = { "Cache-Control": "no-store" };

function inactive(): ShellStatus {
  return { runtime: "inactive", positions: null, alertsTriggered: 0 };
}
