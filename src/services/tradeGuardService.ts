import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAccountProfile } from "@/lib/risk/accountProfile";
import { evaluateAutoTrade } from "@/lib/trading/autoTradeGuard";
import { buildMarketContext } from "@/lib/market/marketContextService";

/**
 * "Do this account's rules permit this order right now?"
 *
 * This used to live inside `alertAutoTradeService`, where it only ever
 * protected one path: an alert firing a trade. Meanwhile
 * `executeExecutionRequestOnMt5` — the server action behind "place this
 * draft" — went straight to `placeMt5QuickOrder` with no guard at all. So AXE
 * would refuse to trade a funded account through red news when an *alert*
 * asked, and place the very same order when the trader tapped a draft it had
 * itself proposed. One door locked, the one beside it open.
 *
 * Both doors now call this.
 */

export type TradeGuardDecision =
  | { allowed: true }
  | { allowed: false; reason: string; detail: string };

/**
 * Gather what the guard needs and ask it. Kept beside the caller rather than
 * inside the pure guard so the decision logic stays testable without a
 * database.
 *
 * Anything we cannot measure is passed as null and the guard treats it as
 * "unknown", never as "fine" — but a missing account row is a hard stop: we
 * will not place an automated order on an account whose rules we cannot read.
 */
export async function decideAutoTradeAllowed(
  supabase: SupabaseClient,
  userId: string,
  symbol: string,
  volumeLots: number,
  /**
   * True when a human pressed the button for this specific order. Passed
   * straight through to the guard, where it drops the daily cap on unattended
   * automation and nothing else.
   */
  attended = false,
): Promise<TradeGuardDecision> {
  const { data: prefsRow } = await supabase
    .from("user_workspace_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  const accountId = (prefsRow?.active_account_id as string | null) ?? null;

  const { data: account } = accountId
    ? await supabase
        .from("user_broker_accounts")
        .select("label,mt5_server,metadata,connection_method")
        .eq("user_id", userId)
        .eq("id", accountId)
        .maybeSingle()
    : { data: null };

  if (!account) {
    return {
      allowed: false,
      reason: "no_account",
      detail:
        "Not placed: AXE could not read this account's trading rules, so it will not place an order on your behalf.",
    };
  }

  const profile = buildAccountProfile({
    label: (account.label as string | null) ?? null,
    mt5Server: (account.mt5_server as string | null) ?? null,
    metadata: (account.metadata as Record<string, unknown> | null) ?? null,
    connectionMethod: (account.connection_method as string | null) ?? null,
  });

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [positionsRes, todayTradesRes, snapshotRes] = await Promise.all([
    supabase.from("mt5_positions").select("id").eq("user_id", userId).eq("account_id", accountId),
    supabase
      .from("broker_trades")
      .select("pnl")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .gte("close_time", dayStart.toISOString()),
    supabase
      .from("mt5_account_snapshots")
      .select("balance")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const todayTrades = (todayTradesRes.data ?? []) as Array<{ pnl: number | null }>;
  const realisedToday = todayTrades.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
  const balance = Number((snapshotRes.data as { balance?: unknown } | null)?.balance ?? NaN);
  const dayResultPct =
    Number.isFinite(balance) && balance > 0 ? (realisedToday / balance) * 100 : null;

  // Automated trades AXE placed today, counted from the feed events it writes.
  const { count: autoTradesToday } = await supabase
    .from("axe_proactive_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .like("event_key", "alert_trade:%")
    .gte("created_at", dayStart.toISOString());

  let minutesToHighImpact: number | null = null;
  try {
    const market = await buildMarketContext({ symbol, watchlist: [symbol], newsLimit: 2, calendarLimit: 8 });
    for (const event of market.events ?? []) {
      if (event.impact !== "high") continue;
      const delta = (new Date(event.startsAt).getTime() - Date.now()) / 60000;
      if (delta < -45 || delta > 90) continue;
      if (minutesToHighImpact === null || Math.abs(delta) < Math.abs(minutesToHighImpact)) {
        minutesToHighImpact = delta;
      }
    }
  } catch {
    // Calendar unavailable. Left as null: the guard treats that as unknown,
    // and a news rule cannot be enforced on data we do not have.
  }

  return evaluateAutoTrade({
    profile,
    volumeLots,
    openPositions: positionsRes.data?.length ?? 0,
    autoTradesToday: autoTradesToday ?? 0,
    dayResultPct,
    minutesToHighImpact,
    now: new Date(),
    attended,
  });
}
