/**
 * What kind of account is this, and what is it not allowed to do?
 *
 * The app already had `isDemoAccount()`, a single regex that lumped demo,
 * FTMO, funded, challenge, prop and evaluation into one bucket. Those need
 * opposite handling: on a demo account a news spike costs nothing, on a funded
 * account trading through red news can end the account outright. AXE cannot
 * warn you about something it does not know.
 *
 * Classification is a hint, never a verdict: anything the trader states
 * explicitly in `user_broker_accounts.metadata.tradingRules` wins over every
 * heuristic here.
 *
 * Dependency-free so it can be exercised with `node --experimental-strip-types`.
 */

export type AccountKind = "live" | "demo" | "prop_evaluation" | "prop_funded" | "unknown";

/**
 * What a loss percentage is measured *from*. Firms differ, and the difference
 * is not cosmetic.
 *
 * FTMO's 2-Step maximum loss is 10% of the initial capital and never moves.
 * Its 1-Step maximum loss is also 10% but trails the highest end-of-day
 * balance, so a trader up 8% has a limit 8% higher than on day one — and a
 * trader who reads "10%" as static will blow through it on the way back down.
 * Its Instant accounts trail intraday instead. Upcomers measures the daily
 * limit from the day's starting equity, FTMO from the day's opening balance:
 * with an open position running, those are different numbers at the same
 * instant.
 *
 * So a percentage without its basis is not a rule, it is a number. AXE stores
 * both or it stores neither.
 */
export type LossBasis =
  /** Fixed share of the starting capital. Never moves. */
  | "initial_balance"
  /** Share of the balance at the day's open — excludes open positions. */
  | "day_start_balance"
  /** Share of the equity at the day's open — includes them. */
  | "day_start_equity"
  /** Trails the highest end-of-day balance, never downward. */
  | "trailing_eod_balance"
  /** Trails the highest balance reached at any point, updated as trades close. */
  | "trailing_peak_balance";

export type TradingConstraints = {
  /** False when the account's rules forbid holding through high-impact news. */
  newsTradingAllowed: boolean;
  /** Percentage that ends the account for the day. Null when unknown. */
  maxDailyLossPct: number | null;
  /** What that percentage is measured from. Null when the percentage is. */
  maxDailyLossBasis: LossBasis | null;
  /**
   * Percentage of total drawdown that ends the account outright.
   *
   * This was not modelled at all, which is the gap that mattered most: the
   * daily limit costs a trader the rest of the day, the overall limit costs
   * them the account. AXE could warn about the first and had no idea the
   * second existed.
   */
  maxTotalLossPct: number | null;
  maxTotalLossBasis: LossBasis | null;
  /** Largest position the rules permit, in lots. Null when unknown. */
  maxLot: number | null;
  /** False when positions may not be carried over the weekend. */
  weekendHoldingAllowed: boolean;
};

/** Where each constraint came from. This is what the UI shows the trader. */
export type ConstraintSource =
  /** The trader stated it for this account. Beats everything. */
  | "stated"
  /** Read from the firm's own published rules — `firmSource` says where. */
  | "firm"
  /** A careful default for this kind of account. A guess, and labelled as one. */
  | "default";

export type ConstraintProvenance = Record<keyof TradingConstraints, ConstraintSource>;

export type AccountProfile = TradingConstraints & {
  kind: AccountKind;
  /** True when any constraint came from the trader rather than a guess. */
  explicit: boolean;
  /** Plain-language summary AXE can speak. */
  description: string;
  /** The firm this account belongs to, when the server name gave it away. */
  firm: DetectedFirm | null;
  /** Field by field: stated, from the firm's rulebook, or a default. */
  provenance: ConstraintProvenance;
};

export type AccountProfileInput = {
  label?: string | null;
  mt5Server?: string | null;
  /** `user_broker_accounts.metadata` — `tradingRules` is read when present. */
  metadata?: Record<string, unknown> | null;
  connectionMethod?: string | null;
};

/* ── Which firm, and which of its models ──────────────────────────────────
   The trader should not have to type their own firm's rulebook into an app.
   They already chose the firm, paid the firm, and passed the firm's
   evaluation; being asked to restate it is homework.

   So AXE reads the MT5 server name. `FTMO-Server`, `GoatFundedTrader-Live`,
   `Upcomers` — the firm is right there, and it is the one field a trader
   cannot get wrong, because the broker set it.

   What AXE does NOT do is pretend to know every firm's numbers. Researched
   2026-10-21, and the reason this registry is mostly empty is worth writing
   down rather than quietly papering over:

     - FTMO publishes its own drawdown table, and it has three account models
       with three different rules: Instant 3% daily / 10% trailing intraday,
       1-Step 3% daily / 10% trailing end-of-day, 2-Step 5% daily / 10%
       static. One "FTMO: 5%/10%" row would be wrong for two of the three.
     - FTMO's news and weekend rules are not on that page, and third-party
       guides gave a 2-minute window and a 4-minute window for the same rule.
     - For Goat Funded Trader, third-party sources gave 4%/6%, 3%/6%, 5%/10%
       and 4%/8% depending on the page and the model, and several had it
       confused with Goat Funded Futures, a different company.

   A number I cannot source is worse than no number, because the trader will
   act on it. So: a firm with no entry here is still recognised by name, still
   gets the cautious default, and AXE says plainly that the limits are not
   confirmed and asks for one tap. A firm with an entry gets its real numbers
   and a link to where they came from.
   ───────────────────────────────────────────────────────────────────────── */

export type FirmRuleSet = {
  /** Null for a firm whose models we do not distinguish. */
  model: string | null;
  /** Lower-cased words in the label or server that pick this model. */
  modelPatterns?: RegExp;
  maxDailyLossPct: number | null;
  maxDailyLossBasis: LossBasis | null;
  maxTotalLossPct: number | null;
  maxTotalLossBasis: LossBasis | null;
  /** Null means we did not confirm it — never a convenient guess. */
  newsTradingAllowed: boolean | null;
  weekendHoldingAllowed: boolean | null;
  maxLot: number | null;
  /** Where these numbers were read. A URL, so the trader can check too. */
  source: string;
  /** When. A rule older than a year is worth re-reading. */
  asOf: string;
};

export type FirmDefinition = {
  id: string;
  /** How the firm writes its own name. */
  name: string;
  /** Matched against the label and the MT5 server name, case-insensitively. */
  pattern: RegExp;
  /** Empty when the firm is recognised but its rules were not confirmed. */
  models: FirmRuleSet[];
};

export type DetectedFirm = {
  id: string;
  name: string;
  /** The model matched, when the name said which. */
  model: string | null;
  /** The rules for it, or null when this firm's numbers are unconfirmed. */
  rules: FirmRuleSet | null;
  /**
   * True when `rules` is the tightest value across the firm's models rather
   * than one model's actual rulebook, because the account did not say which
   * model it is. Safe to act on, worth asking about.
   */
  rulesAreTightestAcrossModels: boolean;
  /**
   * The firm's models, when we know them but the account name did not say
   * which one this is. That is an answerable question — "which FTMO account
   * is this?" — and a very different situation from a firm whose rules we
   * have never read. The two used to produce the same shrug.
   */
  unresolvedModels: string[];
};

export const FIRMS: FirmDefinition[] = [
  {
    id: "ftmo",
    name: "FTMO",
    pattern: /\bftmo\b/i,
    // Source: ftmo.com/en/trading-objectives, read 2026-10-21. The three
    // models genuinely differ; the static-vs-trailing split on the maximum
    // loss is the part a trader is most likely to get wrong, because all
    // three are "10%".
    models: [
      {
        model: "2-Step",
        modelPatterns: /2\s*-?\s*step|two\s*step|\bnormal\b/i,
        maxDailyLossPct: 5,
        maxDailyLossBasis: "day_start_balance",
        maxTotalLossPct: 10,
        maxTotalLossBasis: "initial_balance",
        newsTradingAllowed: null,
        weekendHoldingAllowed: null,
        maxLot: null,
        source: "https://ftmo.com/en/trading-objectives/ — 2-Step: 5% of the Initial Simulated Capital daily, 10% static maximum loss",
        asOf: "2026-10-21",
      },
      {
        model: "1-Step",
        modelPatterns: /1\s*-?\s*step|one\s*step/i,
        maxDailyLossPct: 3,
        maxDailyLossBasis: "day_start_balance",
        maxTotalLossPct: 10,
        maxTotalLossBasis: "trailing_eod_balance",
        newsTradingAllowed: null,
        weekendHoldingAllowed: null,
        maxLot: null,
        source: "https://ftmo.com/en/trading-objectives/ — 1-Step: 3% daily, 10% end-of-day trailing maximum loss",
        asOf: "2026-10-21",
      },
      {
        model: "Instant",
        modelPatterns: /\binstant\b/i,
        maxDailyLossPct: 3,
        maxDailyLossBasis: "day_start_balance",
        maxTotalLossPct: 10,
        maxTotalLossBasis: "trailing_peak_balance",
        newsTradingAllowed: null,
        weekendHoldingAllowed: null,
        maxLot: null,
        source: "https://ftmo.com/en/trading-objectives/ — Instant: 3% daily, 10% intraday balance-based trailing maximum loss",
        asOf: "2026-10-21",
      },
    ],
  },
  {
    id: "upcomers",
    name: "Upcomers",
    pattern: /\bupcomers\b/i,
    models: [
      {
        model: "Oracle",
        modelPatterns: /\boracle\b/i,
        maxDailyLossPct: 4,
        maxDailyLossBasis: "day_start_equity",
        maxTotalLossPct: null,
        maxTotalLossBasis: null,
        newsTradingAllowed: true,
        weekendHoldingAllowed: true,
        maxLot: null,
        source: "https://help.upcomers.com — Oracle: 4% daily from the day's starting equity; news and weekend holding allowed",
        asOf: "2026-10-19",
      },
    ],
  },

  /* Recognised by name, numbers not confirmed. Each of these gets the cautious
     default and an honest "check your dashboard" — which is still far better
     than `unknown`, where every rail was off. Adding real rules to one of
     these means reading that firm's own page and citing it, not copying a
     comparison table. */
  { id: "goat_funded", name: "Goat Funded Trader", pattern: /\bgoat\s*funded\b/i, models: [] },
  { id: "the5ers", name: "The5ers", pattern: /\bthe\s*5\s*ers\b|\bthe5ers\b/i, models: [] },
  { id: "fundednext", name: "FundedNext", pattern: /\bfunded\s*next\b/i, models: [] },
  { id: "fundingpips", name: "FundingPips", pattern: /\bfunding\s*pips\b/i, models: [] },
  { id: "alpha_capital", name: "Alpha Capital Group", pattern: /\balpha\s*capital\b/i, models: [] },
  { id: "e8", name: "E8 Markets", pattern: /\be8\b/i, models: [] },
  { id: "blue_guardian", name: "Blue Guardian", pattern: /\bblue\s*guardian\b/i, models: [] },
  { id: "instant_funding", name: "Instant Funding", pattern: /\binstant\s*funding\b/i, models: [] },
  { id: "maven", name: "Maven Trading", pattern: /\bmaven\b/i, models: [] },
  { id: "breakout", name: "Breakout Prop", pattern: /\bbreakout\s*prop\b/i, models: [] },
  { id: "cti", name: "City Traders Imperium", pattern: /\bcity\s*traders\s*imperium\b|\bcti\b/i, models: [] },
  { id: "funded_trading_plus", name: "Funded Trading Plus", pattern: /\bfunded\s*trading\s*plus\b/i, models: [] },
  { id: "for_traders", name: "For Traders", pattern: /\bfor\s*traders\b/i, models: [] },
  { id: "seacrest", name: "Seacrest Funded", pattern: /\bseacrest\b/i, models: [] },
  { id: "aquafunded", name: "AquaFunded", pattern: /\baqua\s*funded\b/i, models: [] },
  { id: "lark", name: "Lark Funding", pattern: /\blark\s*funding\b/i, models: [] },
  { id: "ment", name: "Ment Funding", pattern: /\bment\s*funding\b/i, models: [] },
  { id: "quanttekel", name: "Quantтekel", pattern: /\bquanttekel\b/i, models: [] },
  { id: "myforexfunds", name: "MyForexFunds", pattern: /\bmy\s*forex\s*funds\b|\bmff\b/i, models: [] },
  { id: "smart_prop", name: "Smart Prop Trader", pattern: /\bsmart\s*prop\b/i, models: [] },
  { id: "fundingtraders", name: "Funding Traders", pattern: /\bfunding\s*traders\b/i, models: [] },
  { id: "topstep", name: "Topstep", pattern: /\btopstep\b/i, models: [] },
  { id: "apex", name: "Apex Trader Funding", pattern: /\bapex\b/i, models: [] },
  { id: "alpha_futures", name: "Alpha Futures", pattern: /\balpha\s*futures\b/i, models: [] },
];

/**
 * The most conservative reading of a firm's models, for an account that did
 * not say which model it is.
 *
 * The alternative is what this replaced: fall all the way back to the generic
 * prop default, 5% daily. For Upcomers — whose Oracle limit is 4% — that
 * handed back a limit 1% looser than the firm's own, and 1% of a $200,000
 * account is $2,000 of trading AXE would have allowed past the point the
 * account was already breached. Falling back past a number you have is worse
 * than not having it.
 *
 * Tightest means: the smallest percentage and lot cap, and a restriction wins
 * over a permission. It can only ever make AXE more careful than the real
 * rulebook, never less. A basis is kept only when every model agrees on it —
 * "4%" is safe to act on, "4% of something" is not something to guess at.
 */
function tightestAcrossModels(models: FirmRuleSet[]): FirmRuleSet | null {
  if (models.length === 0) return null;
  if (models.length === 1) return models[0]!;

  const tighterNumber = (a: number | null, b: number | null): number | null => {
    if (a === null) return b;
    if (b === null) return a;
    return Math.min(a, b);
  };
  const tighterFlag = (a: boolean | null, b: boolean | null): boolean | null => {
    if (a === null) return b;
    if (b === null) return a;
    return a && b;
  };
  const agreedBasis = (pick: (m: FirmRuleSet) => LossBasis | null): LossBasis | null => {
    const values = models.map(pick).filter((v): v is LossBasis => v !== null);
    if (values.length !== models.length) return null;
    return values.every((v) => v === values[0]) ? values[0]! : null;
  };

  const combined = models.reduce<FirmRuleSet>(
    (acc, model) => ({
      model: null,
      maxDailyLossPct: tighterNumber(acc.maxDailyLossPct, model.maxDailyLossPct),
      maxDailyLossBasis: null,
      maxTotalLossPct: tighterNumber(acc.maxTotalLossPct, model.maxTotalLossPct),
      maxTotalLossBasis: null,
      newsTradingAllowed: tighterFlag(acc.newsTradingAllowed, model.newsTradingAllowed),
      weekendHoldingAllowed: tighterFlag(acc.weekendHoldingAllowed, model.weekendHoldingAllowed),
      maxLot: tighterNumber(acc.maxLot, model.maxLot),
      source: acc.source,
      asOf: acc.asOf < model.asOf ? acc.asOf : model.asOf,
    }),
    {
      ...models[0]!,
      model: null,
      maxDailyLossBasis: null,
      maxTotalLossBasis: null,
      source: `tightest across ${models.length} models — ${models[0]!.source}`,
    },
  );

  // Where every model measures a limit the same way, that basis holds whatever
  // model this turns out to be, so keep it. FTMO's three models all take the
  // daily limit from the day's opening balance and disagree only on the total
  // (static, end-of-day trailing, intraday trailing) — so the trader gets the
  // full daily rule and an honest blank next to the total.
  return {
    ...combined,
    maxDailyLossBasis: agreedBasis((m) => m.maxDailyLossBasis),
    maxTotalLossBasis: agreedBasis((m) => m.maxTotalLossBasis),
  };
}

/**
 * Which firm — from the label and the server name only.
 *
 * Deliberately excludes `metadata.firmModel`. That field arrives in a request
 * body, and with it in here a model of "FTMO 2-Step" stored against an
 * Upcomers account resolved the whole account to FTMO: a value the client
 * controls silently swapping which firm's rulebook protects the trader, in
 * either direction. The firm comes from what the broker set. The model only
 * ever narrows within that firm.
 */
function firmHaystack(input: AccountProfileInput): string {
  return `${input.label ?? ""} ${input.mt5Server ?? ""}`.trim();
}

/**
 * Which of that firm's models — the above, plus the model the trader picked.
 *
 * One tap on a list AXE already knows ("2-Step") resolves the firm's real
 * published numbers, with no other plumbing. Length-capped where it is
 * parsed, in accountRules.ts.
 */
function modelHaystack(input: AccountProfileInput): string {
  const model = (input.metadata ?? {})["firmModel"];
  const modelText = typeof model === "string" ? model : "";
  return `${firmHaystack(input)} ${modelText}`.trim();
}

/**
 * Which firm this account belongs to, and which of its models.
 *
 * When the firm has models but the name does not say which, `rules` is null
 * rather than the first model: picking one would be a coin flip between a 3%
 * and a 5% daily limit, and the trader would never know a coin had been
 * flipped.
 */
export function detectFirm(input: AccountProfileInput): DetectedFirm | null {
  const forFirm = firmHaystack(input);
  if (!forFirm) return null;
  const forModel = modelHaystack(input);

  for (const firm of FIRMS) {
    if (!firm.pattern.test(forFirm)) continue;
    const matched = firm.models.find((m) => m.modelPatterns?.test(forModel)) ?? null;
    const fallback = matched ? null : tightestAcrossModels(firm.models);
    return {
      id: firm.id,
      name: firm.name,
      model: matched?.model ?? null,
      rules: matched ?? fallback,
      rulesAreTightestAcrossModels: matched === null && fallback !== null && firm.models.length > 1,
      unresolvedModels: matched
        ? []
        : firm.models.map((m) => m.model).filter((m): m is string => m !== null),
    };
  }
  return null;
}

function classify(input: AccountProfileInput): AccountKind {
  const hay = firmHaystack(input).toLowerCase();
  if (!hay) return "unknown";

  const mentionsProp = detectFirm(input) !== null || /\b(prop|funding|funded)\b/.test(hay);

  if (mentionsProp) {
    // "funded" / "live" on a prop account means the evaluation is passed.
    if (/\bfunded\b/.test(hay) && !/\b(challenge|evaluation|phase|step)\b/.test(hay)) {
      return "prop_funded";
    }
    if (/\b(challenge|evaluation|phase|step|trial)\b/.test(hay)) return "prop_evaluation";
    // A prop firm named without either word: treat as an evaluation, the
    // stricter of the two, so AXE errs toward warning rather than silence.
    return "prop_evaluation";
  }

  if (/\bdemo\b/.test(hay)) return "demo";
  if (/\b(live|real)\b/.test(hay)) return "live";
  return "unknown";
}

/** Defaults per account kind, before the trader's own rules are applied. */
function defaultsFor(kind: AccountKind): TradingConstraints {
  switch (kind) {
    case "prop_funded":
    case "prop_evaluation":
      // Nearly every prop firm restricts news trading and weekend holding. A
      // warning you did not need costs a glance; a missing one costs the
      // account. The trader can switch it off per account.
      return {
        newsTradingAllowed: false,
        maxDailyLossPct: 5,
        maxDailyLossBasis: "day_start_balance",
        // 10% total is the most common figure across the firms whose pages
        // state one, and the cautious end of the range. Still a default, and
        // `provenance` says so.
        maxTotalLossPct: 10,
        maxTotalLossBasis: "initial_balance",
        maxLot: null,
        weekendHoldingAllowed: false,
      };
    case "live":
      return {
        newsTradingAllowed: true,
        maxDailyLossPct: null,
        maxDailyLossBasis: null,
        maxTotalLossPct: null,
        maxTotalLossBasis: null,
        maxLot: null,
        weekendHoldingAllowed: true,
      };
    case "demo":
    case "unknown":
    default:
      return {
        newsTradingAllowed: true,
        maxDailyLossPct: null,
        maxDailyLossBasis: null,
        maxTotalLossPct: null,
        maxTotalLossBasis: null,
        maxLot: null,
        weekendHoldingAllowed: true,
      };
  }
}

function readBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "yes") return true;
    if (v === "false" || v === "no") return false;
  }
  return null;
}

function readNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function kindLabel(kind: AccountKind): string {
  switch (kind) {
    case "prop_funded":
      return "a funded prop account";
    case "prop_evaluation":
      return "a prop evaluation account";
    case "live":
      return "a live account";
    case "demo":
      return "a demo account";
    default:
      return "an account of unknown type";
  }
}

export function buildAccountProfile(input: AccountProfileInput): AccountProfile {
  const kind = classify(input);
  const firm = detectFirm(input);
  const firmRules = firm?.rules ?? null;
  const fallback = defaultsFor(kind);

  /*
   * Three layers, each beating the one under it: what the trader stated, what
   * the firm publishes, and a cautious default for this kind of account.
   *
   * A firm field is only used when the firm's own page gave it. FTMO's
   * drawdown table is public and exact; its news and weekend rules are not on
   * that page, and the third-party guides said 2 minutes in one place and 4
   * in another. So those stay null here and fall through to the cautious
   * default — AXE still warns, it just does not claim the firm said so.
   */
  const pick = <T>(
    stated: T | null,
    fromFirm: T | null | undefined,
    fromDefault: T,
  ): { value: T; source: ConstraintSource } => {
    if (stated !== null && stated !== undefined) return { value: stated, source: "stated" };
    if (fromFirm !== null && fromFirm !== undefined) return { value: fromFirm, source: "firm" };
    return { value: fromDefault, source: "default" };
  };

  const rulesRaw = (input.metadata ?? {})["tradingRules"];
  const rules =
    rulesRaw && typeof rulesRaw === "object" && !Array.isArray(rulesRaw)
      ? (rulesRaw as Record<string, unknown>)
      : {};

  const news = pick(readBool(rules.newsTradingAllowed), firmRules?.newsTradingAllowed, fallback.newsTradingAllowed);
  const weekend = pick(readBool(rules.weekendHoldingAllowed), firmRules?.weekendHoldingAllowed, fallback.weekendHoldingAllowed);
  const dailyLoss = pick(readNumber(rules.maxDailyLossPct), firmRules?.maxDailyLossPct, fallback.maxDailyLossPct);
  const totalLoss = pick(readNumber(rules.maxTotalLossPct), firmRules?.maxTotalLossPct, fallback.maxTotalLossPct);
  const maxLot = pick(readNumber(rules.maxLot), firmRules?.maxLot, fallback.maxLot);

  /*
   * A basis follows its percentage. If the trader overrode the number, the
   * firm's basis no longer describes it — they typed 4% from their dashboard,
   * and we have no idea what that 4% is measured from. Claiming
   * "day_start_equity" there would be inventing the most load-bearing half of
   * the rule, so it comes back null and the guard treats it as unknown.
   */
  const dailyBasis: { value: LossBasis | null; source: ConstraintSource } =
    dailyLoss.source === "stated"
      ? { value: null, source: "stated" }
      : dailyLoss.source === "firm"
        ? { value: firmRules?.maxDailyLossBasis ?? null, source: "firm" }
        : { value: fallback.maxDailyLossBasis, source: "default" };

  const totalBasis: { value: LossBasis | null; source: ConstraintSource } =
    totalLoss.source === "stated"
      ? { value: null, source: "stated" }
      : totalLoss.source === "firm"
        ? { value: firmRules?.maxTotalLossBasis ?? null, source: "firm" }
        : { value: fallback.maxTotalLossBasis, source: "default" };

  const constraints: TradingConstraints = {
    newsTradingAllowed: news.value,
    weekendHoldingAllowed: weekend.value,
    maxDailyLossPct: dailyLoss.value,
    maxDailyLossBasis: dailyBasis.value,
    maxTotalLossPct: totalLoss.value,
    maxTotalLossBasis: totalBasis.value,
    maxLot: maxLot.value,
  };

  const provenance: ConstraintProvenance = {
    newsTradingAllowed: news.source,
    weekendHoldingAllowed: weekend.source,
    maxDailyLossPct: dailyLoss.source,
    maxDailyLossBasis: dailyBasis.source,
    maxTotalLossPct: totalLoss.source,
    maxTotalLossBasis: totalBasis.source,
    maxLot: maxLot.source,
  };

  const explicit = Object.values(provenance).some((source) => source === "stated");

  const notes: string[] = [];
  if (!constraints.newsTradingAllowed) notes.push("no trading through high-impact news");
  if (!constraints.weekendHoldingAllowed) notes.push("no positions over the weekend");
  if (constraints.maxDailyLossPct !== null) {
    notes.push(`daily loss cap ${constraints.maxDailyLossPct}%${basisNote(constraints.maxDailyLossBasis)}`);
  }
  if (constraints.maxTotalLossPct !== null) {
    notes.push(`total drawdown cap ${constraints.maxTotalLossPct}%${basisNote(constraints.maxTotalLossBasis)}`);
  }
  if (constraints.maxLot !== null) notes.push(`max ${constraints.maxLot} lots`);

  /*
   * The old description ended with "(assumed from the account name)" whenever
   * the trader had stated nothing. That lumped two very different situations
   * together: rules read off FTMO's own page, and a blanket guess. Naming the
   * firm, and saying which of the two this is, is the difference between
   * something a trader trusts and something they switch off.
   */
  const head = firm
    ? `${firm.name}${firm.model ? ` ${firm.model}` : ""} — ${kindLabel(kind)}`
    : kindLabel(kind);
  const anyFromFirm =
    Object.values(provenance).includes("firm") && !(firm?.rulesAreTightestAcrossModels ?? false);
  const tail = explicit
    ? ""
    : anyFromFirm
      ? ` (from ${possessive(firm?.name ?? "the firm")} published rules)`
      : firm && firm.unresolvedModels.length > 0
        ? // The firm's rules are known, but they differ per model and the
          // account name did not say which, so these are the tightest of
          // them. Asking one answerable question beats a blanket "not
          // confirmed": FTMO's daily limit is 3% on two of its three models
          // and 5% on the other.
          ` — the strictest of ${possessive(firm.name)} accounts` +
          ` (${firm.unresolvedModels.join(", ")}). Tell AXE which one you have and it will use that one's rules.`
        : firm
          ? ` (limits not confirmed for ${firm.name} — check your dashboard)`
          : kind === "prop_funded" || kind === "prop_evaluation"
            ? " (assumed from the account name)"
            : "";

  const description = `${head}${notes.length ? ` — ${notes.join(", ")}` : ""}${tail}`;

  return { kind, explicit, description, firm, provenance, ...constraints };
}

/** "FTMO's" but "Upcomers'" — the firms' own names decide, not a blanket 's. */
function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/** " of the day's starting equity" — the half of a limit that is usually dropped. */
export function basisNote(basis: LossBasis | null): string {
  switch (basis) {
    case "initial_balance":
      return " of the starting balance";
    case "day_start_balance":
      return " of the day's opening balance";
    case "day_start_equity":
      return " of the day's starting equity";
    case "trailing_eod_balance":
      return " trailing your best end-of-day balance";
    case "trailing_peak_balance":
      return " trailing your highest balance";
    default:
      return "";
  }
}

/**
 * Should AXE warn about an upcoming high-impact event, and in what words?
 *
 * The old rule only fired when positions were already open. That is exactly
 * backwards for a funded account: the moment that matters is *before* you take
 * the trade, when the rules still allow you to not take it.
 */
export function newsWarningFor(
  profile: AccountProfile,
  context: { openPositions: number; minutesUntil: number; eventTitle: string; currency?: string | null },
): { title: string; body: string } | null {
  const { openPositions, minutesUntil, eventTitle, currency } = context;
  if (minutesUntil < 0 || minutesUntil > 45) return null;

  const when = `in ~${Math.max(1, Math.round(minutesUntil))}m`;
  const label = `${currency ? `${currency} ` : ""}${eventTitle}`.trim();

  if (!profile.newsTradingAllowed) {
    // Fires whether or not anything is open — the restriction is on trading,
    // not on having a position.
    return {
      title: `News risk: ${label}`,
      body:
        openPositions > 0
          ? `High-impact event ${when}. This is ${profile.description} — you have ${openPositions} open position${openPositions === 1 ? "" : "s"} to close or justify.`
          : `High-impact event ${when}. This is ${profile.description} — stay flat until it has passed.`,
    };
  }

  if (openPositions > 0) {
    return {
      title: `News risk: ${label}`,
      body: `High-impact event ${when} — you have ${openPositions} open position${openPositions === 1 ? "" : "s"}.`,
    };
  }

  // Flat, and allowed to trade news: nothing worth interrupting anyone for.
  return null;
}
