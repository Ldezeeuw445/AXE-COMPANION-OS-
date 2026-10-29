import type { AxePlanId } from "@/lib/billing/tiers";
import {
  liveAccountsCapForPlan,
  planDisplayLabel,
  tierById,
} from "@/lib/billing/tiers";

/** Connection methods that count toward the plan's live-account cap. */
export const LIVE_CONNECTION_METHODS = new Set([
  "cloud_mt5",
  "cloud_mt5_disconnected",
  "alpaca_live",
  "local_bridge",
]);

/** Paper/demo methods — never count toward live caps. */
export const NON_LIVE_CONNECTION_METHODS = new Set([
  "demo_paper",
  "cloud_alpaca",
  "alpaca_paper_byo",
]);

export type LiveAccountLike = {
  id?: string;
  connection_method?: string | null;
  trading_mode?: string | null;
  provider?: string | null;
  status?: string | null;
};

/**
 * True when this broker row occupies a live-account slot.
 * Demo/paper never count. Disconnected MT5 still occupies the slot
 * (grandfather: user can recover without needing a free slot).
 */
export function isLiveBrokerAccount(row: LiveAccountLike): boolean {
  const method = (row.connection_method ?? "").trim();
  if (NON_LIVE_CONNECTION_METHODS.has(method)) return false;
  if ((row.provider ?? "").toLowerCase() === "demo") return false;
  if (LIVE_CONNECTION_METHODS.has(method)) return true;
  if ((row.trading_mode ?? "").toLowerCase() === "live") return true;
  return false;
}

export function normalizePlanId(plan: string | null | undefined): AxePlanId {
  if (plan === "pro" || plan === "founder" || plan === "elite") return plan;
  return "free";
}

export function countLiveBrokerAccounts(rows: LiveAccountLike[]): number {
  return rows.filter(isLiveBrokerAccount).length;
}

export type LiveAccountGateResult =
  | { allowed: true; used: number; cap: number; plan: AxePlanId }
  | {
      allowed: false;
      used: number;
      cap: number;
      plan: AxePlanId;
      message: string;
    };

/**
 * Gate for CONNECTING / ACTIVATING a *new* live account.
 * Pass excludeAccountId when updating/reconnecting an existing row — that
 * never consumes an extra slot (grandfather / reconnect).
 */
export function canConnectLiveAccount(opts: {
  plan: string | null | undefined;
  existingAccounts: LiveAccountLike[];
  /**
   * When reconnecting/updating this existing row, always allow — never
   * disconnect or block trading on accounts already connected (grandfather).
   */
  excludeAccountId?: string | null;
}): LiveAccountGateResult {
  const plan = normalizePlanId(opts.plan);
  const cap = liveAccountsCapForPlan(plan);
  const usedAll = countLiveBrokerAccounts(opts.existingAccounts);

  if (opts.excludeAccountId) {
    const existing = opts.existingAccounts.find((a) => a.id === opts.excludeAccountId);
    if (existing) {
      // Reconnect / update of an already-stored account — grandfathered.
      return { allowed: true, used: usedAll, cap, plan };
    }
  }

  if (usedAll >= cap) {
    return {
      allowed: false,
      used: usedAll,
      cap,
      plan,
      message: liveAccountCapMessage({ plan, cap, used: usedAll }),
    };
  }
  return { allowed: true, used: usedAll, cap, plan };
}

export function liveAccountCapMessage(opts: {
  plan: AxePlanId | string;
  cap: number;
  used?: number;
}): string {
  const plan = normalizePlanId(opts.plan);
  const label = planDisplayLabel(plan);
  const usedPart =
    typeof opts.used === "number" ? ` You already have ${opts.used}.` : "";
  return `Your ${label} plan includes ${opts.cap} live account${opts.cap === 1 ? "" : "s"}.${usedPart} Upgrade to connect another, or disconnect one first. Demo and paper accounts do not count.`;
}

/** Short copy for the connect wizard header. */
export function liveAccountsIncludedNotice(plan: string | null | undefined): string {
  const id = normalizePlanId(plan);
  const n = liveAccountsCapForPlan(id);
  return `Your plan includes ${n} live account${n === 1 ? "" : "s"}.`;
}

export { liveAccountsCapForPlan, tierById };
