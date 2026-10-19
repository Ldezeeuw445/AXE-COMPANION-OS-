/**
 * The rules a trader states for one account, in their own words.
 *
 * `accountProfile.ts` has always said that anything stated explicitly in
 * `user_broker_accounts.metadata.tradingRules` wins over its heuristics — the
 * escape hatch for when a guess is wrong. Measured 2026-10-19: nothing in the
 * entire codebase ever wrote that key. The safety valve was documented,
 * trusted by the guard, and unreachable.
 *
 * It matters more than it sounds. A real $200,000 Upcomers "Oracle" account
 * has a 4% daily loss limit, and allows news trading and weekend holding. The
 * heuristic's prop defaults are 5%, news off, weekend off: wrong in three
 * directions, and the 5% is the dangerous one — AXE would keep placing trades
 * between 4% and 5% down, past the point where the account is already gone.
 *
 * Dependency-free so `node --experimental-strip-types` can exercise it.
 */

export type AccountTradingRules = {
  newsTradingAllowed: boolean | null;
  weekendHoldingAllowed: boolean | null;
  maxDailyLossPct: number | null;
  maxLot: number | null;
};

export const EMPTY_ACCOUNT_RULES: AccountTradingRules = {
  newsTradingAllowed: null,
  weekendHoldingAllowed: null,
  maxDailyLossPct: null,
  maxLot: null,
};

/** A daily loss limit above this is not a prop rule, it is a typo. */
export const MAX_DAILY_LOSS_PCT_CEILING = 50;
/** Matches the autonomy ceiling: a cap nobody could mean. */
export const MAX_LOT_CEILING = 50;

function readBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "yes") return true;
    if (v === "false" || v === "no") return false;
  }
  return null;
}

function readNumber(value: unknown, ceiling: number): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, ceiling);
}

/** Parse whatever arrived into rules, dropping anything that is not one. */
export function parseAccountRules(input: unknown): AccountTradingRules {
  if (!input || typeof input !== "object" || Array.isArray(input)) return EMPTY_ACCOUNT_RULES;
  const r = input as Record<string, unknown>;
  return {
    newsTradingAllowed: readBool(r.newsTradingAllowed),
    weekendHoldingAllowed: readBool(r.weekendHoldingAllowed),
    maxDailyLossPct: readNumber(r.maxDailyLossPct, MAX_DAILY_LOSS_PCT_CEILING),
    maxLot: readNumber(r.maxLot, MAX_LOT_CEILING),
  };
}

/** True when the trader has stated at least one rule. */
export function hasAnyRule(rules: AccountTradingRules): boolean {
  return (
    rules.newsTradingAllowed !== null ||
    rules.weekendHoldingAllowed !== null ||
    rules.maxDailyLossPct !== null ||
    rules.maxLot !== null
  );
}

/**
 * Merge stated rules into the account's existing metadata.
 *
 * Only `tradingRules` is touched: the rest of that blob is MetaApi
 * bookkeeping (region, password type, provisioning probes) and overwriting it
 * would break the connection the trader just made.
 */
export function withTradingRules(
  metadata: Record<string, unknown> | null | undefined,
  rules: AccountTradingRules,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {};
  // Null means "no rule stated", which is not the same as "stated as off".
  // Dropping the nulls keeps buildAccountProfile's `explicit` flag honest.
  const stated: Record<string, unknown> = {};
  if (rules.newsTradingAllowed !== null) stated.newsTradingAllowed = rules.newsTradingAllowed;
  if (rules.weekendHoldingAllowed !== null) stated.weekendHoldingAllowed = rules.weekendHoldingAllowed;
  if (rules.maxDailyLossPct !== null) stated.maxDailyLossPct = rules.maxDailyLossPct;
  if (rules.maxLot !== null) stated.maxLot = rules.maxLot;

  if (Object.keys(stated).length === 0) {
    delete base.tradingRules;
    return base;
  }
  base.tradingRules = stated;
  base.tradingRulesStatedAt = new Date().toISOString();
  return base;
}
