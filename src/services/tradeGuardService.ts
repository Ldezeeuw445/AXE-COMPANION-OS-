import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAccountProfile } from "@/lib/risk/accountProfile";
import {
  dayAnchorBase,
  dayResultPctFromEquity,
  resolveCurrentEquity,
} from "@/lib/risk/dailyLoss";
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
import {
  DEFAULT_SESSION_ZONE,
  brokerDayStart,
  resolveSessionZone,
} from "@/lib/chart/sessionDay";

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
 * Both doors now call this. So does `/api/mt5/order`.
 */

export type TradeGuardDecision =
  | { allowed: true; accountId: string }
  | { allowed: false; reason: string; detail: string };

export type TradeGuardPriceContext = {
  entryPrice?: number | null;
  stopLoss?: number | null;
  /**
   * Evaluate this broker account, not `active_account_id`. The order route
   * takes the account from the request body; using the workspace active
   * account here would guard the wrong book.
   */
  brokerAccountId?: string | null;
};

/**
 * Gather what the guard needs and ask it. Kept beside the caller rather than
 * inside the pure guard so the decision logic stays testable without a
 * database.
 *
 * Anything we cannot measure is passed as null and the guard treats it as
 * "unknown", never as "fine" — but a missing account row is a hard stop: we
 * will not place an automated order on an account whose rules we cannot read.
 * Query errors also fail closed (`guard_data_error` / `schema_missing`).
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
  priceContext: TradeGuardPriceContext = {},
): Promise<TradeGuardDecision> {
  const prefsRes = await supabase
    .from("user_workspace_preferences")
    .select(
      "active_account_id,autonomy_level,autonomy_max_lot,autonomy_max_risk_pct,autonomy_max_trades_per_day,autonomy_ack_unattended,autonomy_ack_limits,autonomy_ack_loss,autonomy_granted_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (prefsRes.error) {
    const missingAutonomy =
      /autonomy_/i.test(prefsRes.error.message) ||
      prefsRes.error.code === "42703" ||
      prefsRes.error.code === "PGRST204";
    console.error("[tradeGuard] prefs lookup failed", prefsRes.error.message);
    return {
      allowed: false,
      reason: missingAutonomy ? "schema_missing" : "guard_data_error",
      detail: missingAutonomy
        ? "Database migration not applied (autonomy_*)."
        : `Not placed: could not read workspace preferences (${prefsRes.error.message}).`,
    };
  }

  const prefsRow = prefsRes.data;
  const accountId =
    (typeof priceContext.brokerAccountId === "string" && priceContext.brokerAccountId
      ? priceContext.brokerAccountId
      : null) ??
    ((prefsRow?.active_account_id as string | null) ?? null);

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

  if (!accountId) {
    return {
      allowed: false,
      reason: "no_account",
      detail:
        "Not placed: AXE could not read this account's trading rules, so it will not place an order on your behalf.",
    };
  }

  const accountRes = await supabase
    .from("user_broker_accounts")
    .select("id,label,mt5_server,metadata,connection_method")
    .eq("user_id", userId)
    .eq("id", accountId)
    .maybeSingle();

  if (accountRes.error) {
    console.error("[tradeGuard] account lookup failed", accountRes.error.message);
    return {
      allowed: false,
      reason: "guard_data_error",
      detail: `Not placed: could not read user_broker_accounts (${accountRes.error.message}).`,
    };
  }

  const account = accountRes.data;
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

  const metadata =
    account.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
      ? (account.metadata as Record<string, unknown>)
      : {};
  const brokerTz = resolveSessionZone(
    (typeof metadata.serverTimezone === "string" && metadata.serverTimezone) ||
      (typeof metadata.brokerTimezone === "string" && metadata.brokerTimezone) ||
      DEFAULT_SESSION_ZONE,
  );
  const resetTime =
    typeof metadata.dailyResetTime === "string" && metadata.dailyResetTime.trim()
      ? metadata.dailyResetTime.trim()
      : "00:00";
  const now = new Date();
  const dayStart = brokerDayStart(now, brokerTz, resetTime);

  const [positionsRes, snapshotRes, dayStartSnapshotRes] = await Promise.all([
    supabase
      .from("mt5_positions")
      .select("id,profit,swap")
      .eq("user_id", userId)
      .eq("account_id", accountId),
    supabase
      .from("mt5_account_snapshots")
      .select("balance,equity,updated_at")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("mt5_account_snapshots")
      .select("balance,equity,updated_at")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .gte("updated_at", dayStart.toISOString())
      .order("updated_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (positionsRes.error) {
    console.error("[tradeGuard] mt5_positions failed", positionsRes.error.message);
    return {
      allowed: false,
      reason: "guard_data_error",
      detail: `Not placed: could not read mt5_positions (${positionsRes.error.message}).`,
    };
  }
  if (snapshotRes.error) {
    console.error("[tradeGuard] mt5_account_snapshots failed", snapshotRes.error.message);
    return {
      allowed: false,
      reason: "guard_data_error",
      detail: `Not placed: could not read mt5_account_snapshots (${snapshotRes.error.message}).`,
    };
  }
  if (dayStartSnapshotRes.error) {
    console.error("[tradeGuard] day-start snapshot failed", dayStartSnapshotRes.error.message);
    return {
      allowed: false,
      reason: "guard_data_error",
      detail: `Not placed: could not read day-start mt5_account_snapshots (${dayStartSnapshotRes.error.message}).`,
    };
  }

  const positions = (positionsRes.data ?? []) as Array<{
    id?: string;
    profit?: number | null;
    swap?: number | null;
  }>;
  const floatingPnl = positions.reduce(
    (sum, p) => sum + Number(p.profit ?? 0) + Number(p.swap ?? 0),
    0,
  );

  const latest = snapshotRes.data as
    | { balance?: unknown; equity?: unknown; updated_at?: string | null }
    | null;
  const dayStartRow = dayStartSnapshotRes.data as
    | { balance?: unknown; equity?: unknown }
    | null;

  const currentEquity = resolveCurrentEquity({
    snapshotEquity: latest?.equity != null ? Number(latest.equity) : null,
    snapshotBalance: latest?.balance != null ? Number(latest.balance) : null,
    floatingPnl,
  });

  // Prefer the first snapshot at/after broker-day open. If that tick was
  // missed, fall back to max(balance, equity) on the same row (stricter).
  const startEquity =
    dayAnchorBase(
      dayStartRow?.balance != null ? Number(dayStartRow.balance) : null,
      dayStartRow?.equity != null ? Number(dayStartRow.equity) : null,
      profile.maxDailyLossBasis === "day_start_balance" ? "balance" : "max",
    ) ??
    // Last resort only when there is no day-start row: refuse via null below
    // rather than inventing "start = current".
    null;

  const dayResultPct = dayResultPctFromEquity(startEquity, currentEquity);

  // Automated trades AXE placed today, counted from the feed events it writes.
  const autoTradesRes = await supabase
    .from("axe_proactive_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .like("event_key", "alert_trade:%")
    .gte("created_at", dayStart.toISOString());

  if (autoTradesRes.error) {
    console.error("[tradeGuard] axe_proactive_events failed", autoTradesRes.error.message);
    return {
      allowed: false,
      reason: "guard_data_error",
      detail: `Not placed: could not read axe_proactive_events (${autoTradesRes.error.message}).`,
    };
  }

  let minutesToHighImpact: number | null = null;
  try {
    const market = await buildMarketContext({
      symbol,
      watchlist: [symbol],
      newsLimit: 2,
      calendarLimit: 8,
    });
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

  // Risk % per trade uses equity, not balance — same number the day cap uses.
  const riskPct = tradeRiskPct({
    entryPrice: priceContext.entryPrice ?? null,
    stopLoss: priceContext.stopLoss ?? null,
    volumeLots,
    equity: currentEquity,
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

  const decision = evaluateAutoTrade({
    profile,
    volumeLots,
    openPositions: positions.length,
    autoTradesToday: autoTradesRes.count ?? 0,
    dayResultPct,
    minutesToHighImpact,
    now,
    attended,
    userMaxLot: autonomy.maxLot,
    userMaxRiskPct: autonomy.maxRiskPct,
    userMaxTradesPerDay: autonomy.maxTradesPerDay,
    riskPct,
  });

  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason, detail: decision.detail };
  }

  return { allowed: true, accountId };
}
