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
  /**
   * Total drawdown that ends the account outright.
   *
   * Added because it was missing everywhere: the daily limit costs a trader
   * the rest of the day, this one costs them the account, and AXE did not
   * know it existed. Every prop firm has one.
   */
  maxTotalLossPct: number | null;
  maxLot: number | null;
  /**
   * Which of the firm's account models this is — "2-Step", "Instant",
   * "Oracle". Not a rule the trader invents: one tap on a list AXE already
   * knows, which then resolves the firm's real published limits.
   *
   * FTMO's daily limit is 3% on two of its three models and 5% on the other.
   * Without this the only honest answer is a careful guess, and the trader
   * would have had to type the numbers by hand instead of naming their
   * account.
   */
  firmModel: string | null;
  /**
   * The account's initial balance / size as the firm sold it ("100000" for a
   * $100k challenge). FTMO-style daily limits are X% of THIS, measured from the
   * day's opening balance (see `dailyLossReference`). Without it AXE can only
   * infer the figure from the first balance it saw, which is too high on an
   * account connected while in profit.
   */
  accountSize: number | null;
};

export const EMPTY_ACCOUNT_RULES: AccountTradingRules = {
  newsTradingAllowed: null,
  weekendHoldingAllowed: null,
  maxDailyLossPct: null,
  maxTotalLossPct: null,
  maxLot: null,
  firmModel: null,
  accountSize: null,
};

/** A daily loss limit above this is not a prop rule, it is a typo. */
export const MAX_DAILY_LOSS_PCT_CEILING = 50;
/** Same reasoning for the overall cap. */
export const MAX_TOTAL_LOSS_PCT_CEILING = 90;
/** A model name is a short label off a list, not free text. */
export const MAX_FIRM_MODEL_LENGTH = 40;
/**
 * Largest account size accepted. Above it the value is dropped, not clamped:
 * a clamped typo (a stray extra zero) would still read as a real, much looser
 * limit, while a dropped one falls back to AXE's careful inferred figure.
 */
export const MAX_ACCOUNT_SIZE_CEILING = 10_000_000;
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
    maxTotalLossPct: readNumber(r.maxTotalLossPct, MAX_TOTAL_LOSS_PCT_CEILING),
    maxLot: readNumber(r.maxLot, MAX_LOT_CEILING),
    firmModel: readModel(r.firmModel),
    accountSize: readAccountSize(r.accountSize),
  };
}

/** Positive finite amount up to the ceiling; anything else is "not stated". */
function readAccountSize(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_ACCOUNT_SIZE_CEILING) return null;
  return Math.round(n * 100) / 100;
}

/**
 * What the panel shows for one account: the stated rules plus the two values
 * stored beside them (`firmModel`, `accountSize`).
 *
 * Reading only `metadata.tradingRules` dropped both on every reload, and the
 * next "Save rules" then wrote null back over them.
 */
export function rulesFromMetadata(metadata: unknown): AccountTradingRules {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return EMPTY_ACCOUNT_RULES;
  const m = metadata as Record<string, unknown>;
  const stated =
    m.tradingRules && typeof m.tradingRules === "object" && !Array.isArray(m.tradingRules)
      ? (m.tradingRules as Record<string, unknown>)
      : {};
  return parseAccountRules({ ...stated, firmModel: m.firmModel, accountSize: m.accountSize });
}

/**
 * A model name, trimmed and length-capped.
 *
 * It ends up inside the string `detectFirm` pattern-matches against, so an
 * unbounded value from a request body would be matched against every firm's
 * regex. Short, single-line, and that is all it has to be.
 */
function readModel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_FIRM_MODEL_LENGTH);
}

/** True when the trader has stated at least one rule. */
export function hasAnyRule(rules: AccountTradingRules): boolean {
  return (
    rules.newsTradingAllowed !== null ||
    rules.weekendHoldingAllowed !== null ||
    rules.maxDailyLossPct !== null ||
    rules.maxTotalLossPct !== null ||
    rules.maxLot !== null ||
    rules.firmModel !== null ||
    rules.accountSize !== null
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
  if (rules.maxTotalLossPct !== null) stated.maxTotalLossPct = rules.maxTotalLossPct;
  if (rules.maxLot !== null) stated.maxLot = rules.maxLot;

  /*
   * `firmModel` is stored outside `tradingRules` on purpose. Naming which
   * account you have is not stating a rule — it tells AXE which of the firm's
   * published rulebooks applies. Putting it inside would flip `explicit` to
   * true and make the profile claim the trader had stated limits they never
   * typed, which is the exact failure this whole file exists to prevent.
   */
  if (rules.firmModel !== null) base.firmModel = rules.firmModel;
  else delete base.firmModel;

  /*
   * `accountSize` is a fact about the account, not a limit the trader set, so
   * it lives beside `firmModel` for the same reason: inside `tradingRules` it
   * would flip `explicit` to true. `statedAccountSize` reads it from here.
   */
  if (rules.accountSize !== null) base.accountSize = rules.accountSize;
  else delete base.accountSize;

  if (Object.keys(stated).length === 0) {
    delete base.tradingRules;
    delete base.tradingRulesStatedAt;
    return base;
  }
  base.tradingRules = stated;
  base.tradingRulesStatedAt = new Date().toISOString();
  return base;
}
