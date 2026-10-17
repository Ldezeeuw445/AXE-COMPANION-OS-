import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAccountProfile } from "@/lib/risk/accountProfile";
import { evaluateAutoTrade } from "@/lib/trading/autoTradeGuard";
import { buildMarketContext } from "@/lib/market/marketContextService";
import {
  AUTONOMY_MAX_LOT_CEILING,
  AUTONOMY_MAX_RISK_PCT_CEILING,
  AUTONOMY_MAX_TRADES_CEILING,
  DEFAULT_AUTONOMY,
  autonomyAllows,
  isAutonomyLevel,
  normalizeLimit,
  type AutonomySettings,
} from "@/lib/trading/autonomy";
import { tradeRiskPct } from "@/lib/trading/autonomyRisk";
import { pointValuePerLot } from "@/lib/risk/accountRiskBand";

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
   * straight through to the guard, where it lifts the autonomy requirement
   * and the daily cap on unattended automation, and nothing else.
   */
  attended = false,
  /**
   * Entry and stop, when the caller knows them. Without both, risk per trade
   * cannot be worked out — and a trader who set a risk cap gets a refusal
   * rather than a guess. See autonomyRisk.ts.
   */
  priceContext: { entryPrice?: number | null; stopLoss?: number | null } = {},
): Promise<TradeGuardDecision> {
  const { data: prefsRow } = await supabase
    .from("user_workspace_preferences")
    .select(
      "active_account_id,autonomy_level,autonomy_max_lot,autonomy_max_risk_pct,autonomy_max_trades_per_day,autonomy_ack_unattended,autonomy_ack_limits,autonomy_ack_loss,autonomy_granted_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  const accountId = (prefsRow?.active_account_id as string | null) ?? null;

  const rawLevel = Number(prefsRow?.autonomy_level);
  const autonomy: AutonomySettings = prefsRow
    ? {
        level: isAutonomyLevel(rawLevel) ? rawLevel : DEFAULT_AUTONOMY.level,
        maxLot: normalizeLimit(prefsRow.autonomy_max_lot, AUTONOMY_MAX_LOT_CEILING),
        maxRiskPct: normalizeLimit(prefsRow.autonomy_max_risk_pct, AUTONOMY_MAX_RISK_PCT_CEILING),
        maxTradesPerDay: normalizeLimit(
          prefsRow.autonomy_max_trades_per_day,
          AUTONOMY_MAX_TRADES_CEILING,
        ),
        acks: {
          unattended: Boolean(prefsRow.autonomy_ack_unattended),
          limits: Boolean(prefsRow.autonomy_ack_limits),
          loss: Boolean(prefsRow.autonomy_ack_loss),
        },
        grantedAt: (prefsRow.autonomy_granted_at as string | null) ?? null,
      }
    : DEFAULT_AUTONOMY;

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

  // Equity is the balance snapshot: the same number the risk band in the UI
  // measures against, so the cap enforced here is the one the trader was shown.
  const riskPct = tradeRiskPct({
    entryPrice: priceContext.entryPrice ?? null,
    stopLoss: priceContext.stopLoss ?? null,
    volumeLots,
    equity: Number.isFinite(balance) ? balance : null,
    pointValuePerLot: pointValuePerLot(symbol),
  });

  /* ── Did the trader grant AXE this at all? ────────────────────────
     Decided here rather than inside the pure guard, which deliberately has
     no runtime imports. Every path to MT5 goes through this function, and
     `verify-autonomy` holds that true. */
  const permitted = autonomyAllows("place", autonomy, attended);
  if (!permitted.allowed) {
    return { allowed: false, reason: permitted.reason, detail: permitted.detail };
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
    userMaxLot: autonomy.maxLot,
    userMaxRiskPct: autonomy.maxRiskPct,
    userMaxTradesPerDay: autonomy.maxTradesPerDay,
    riskPct,
  });
}
