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

export type TradingConstraints = {
  /** False when the account's rules forbid holding through high-impact news. */
  newsTradingAllowed: boolean;
  /** Percentage of balance that ends the account for the day. Null when unknown. */
  maxDailyLossPct: number | null;
  /** Largest position the rules permit, in lots. Null when unknown. */
  maxLot: number | null;
  /** False when positions may not be carried over the weekend. */
  weekendHoldingAllowed: boolean;
};

export type AccountProfile = TradingConstraints & {
  kind: AccountKind;
  /** True when any constraint came from the trader rather than a guess. */
  explicit: boolean;
  /** Plain-language summary AXE can speak. */
  description: string;
};

export type AccountProfileInput = {
  label?: string | null;
  mt5Server?: string | null;
  /** `user_broker_accounts.metadata` — `tradingRules` is read when present. */
  metadata?: Record<string, unknown> | null;
  connectionMethod?: string | null;
};

/* ── Heuristics ───────────────────────────────────────────────────
   Ordered most specific first. "funded" beats "challenge" beats a bare
   firm name, because a funded account is the one with real consequences.
   ───────────────────────────────────────────────────────────────── */

/**
 * Firms whose name alone is enough to treat an account as a prop account.
 *
 * Measured 2026-10-19 against a real $200,000 Upcomers "Oracle" funded
 * account: the server is literally `Upcomers` and the dashboard never uses the
 * word "funded", so unless the trader happened to type it into the label this
 * classified as `unknown` — news trading allowed, no daily loss limit, weekend
 * holding allowed. Every rail off, on a funded account where one bad news
 * candle ends the whole thing.
 *
 * The list will always be behind the market; that is why `UNKNOWN_IS_NOT_SAFE`
 * below exists. Keep adding, but do not rely on it alone.
 */
const PROP_FIRMS =
  /\b(ftmo|myforexfunds|mff|the5ers|fundednext|funding\s*pips|e8|alpha\s*capital|topstep|apex|truefx|smart\s*prop|goat\s*funded|blue\s*guardian|upcomers|alpha\s*futures|funded\s*trading\s*plus|maven|breakout\s*prop|instant\s*funding|fundingtraders|for\s*traders|seacrest|aquafunded|quanttekel|city\s*traders\s*imperium|cti|lark\s*funding|ment\s*funding)\b/i;

function classify(input: AccountProfileInput): AccountKind {
  const hay = `${input.label ?? ""} ${input.mt5Server ?? ""}`.toLowerCase();
  if (!hay.trim()) return "unknown";

  const mentionsProp = PROP_FIRMS.test(hay) || /\b(prop|funding|funded)\b/.test(hay);

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
        maxLot: null,
        weekendHoldingAllowed: false,
      };
    case "live":
      return {
        newsTradingAllowed: true,
        maxDailyLossPct: null,
        maxLot: null,
        weekendHoldingAllowed: true,
      };
    case "demo":
    case "unknown":
    default:
      return {
        newsTradingAllowed: true,
        maxDailyLossPct: null,
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
  const base = defaultsFor(kind);

  const rulesRaw = (input.metadata ?? {})["tradingRules"];
  const rules =
    rulesRaw && typeof rulesRaw === "object" && !Array.isArray(rulesRaw)
      ? (rulesRaw as Record<string, unknown>)
      : {};

  const statedNews = readBool(rules.newsTradingAllowed);
  const statedWeekend = readBool(rules.weekendHoldingAllowed);
  const statedDailyLoss = readNumber(rules.maxDailyLossPct);
  const statedMaxLot = readNumber(rules.maxLot);

  const explicit =
    statedNews !== null ||
    statedWeekend !== null ||
    statedDailyLoss !== null ||
    statedMaxLot !== null;

  const constraints: TradingConstraints = {
    newsTradingAllowed: statedNews ?? base.newsTradingAllowed,
    weekendHoldingAllowed: statedWeekend ?? base.weekendHoldingAllowed,
    maxDailyLossPct: statedDailyLoss ?? base.maxDailyLossPct,
    maxLot: statedMaxLot ?? base.maxLot,
  };

  const notes: string[] = [];
  if (!constraints.newsTradingAllowed) notes.push("no trading through high-impact news");
  if (!constraints.weekendHoldingAllowed) notes.push("no positions over the weekend");
  if (constraints.maxDailyLossPct !== null) notes.push(`daily loss cap ${constraints.maxDailyLossPct}%`);
  if (constraints.maxLot !== null) notes.push(`max ${constraints.maxLot} lots`);

  const description = `${kindLabel(kind)}${notes.length ? ` — ${notes.join(", ")}` : ""}${
    explicit ? "" : kind === "prop_funded" || kind === "prop_evaluation" ? " (assumed from the account name)" : ""
  }`;

  return { kind, explicit, description, ...constraints };
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
