import type { Mt5AccountSnapshot } from "@/types/context";

/**
 * Account figures for AXE-chat (`live_account` in the Trading OS context).
 *
 * This used to read `mt5_account_snapshots`, a table nothing has written since
 * 2026-04-21, so the chat quoted seven-month-old balances under the heading
 * "LIVE ACCOUNT". The figures now come from `liveAccountState`
 * (user_broker_accounts.metadata) — what every sync and streamer event writes —
 * and carry their age. Past `LIVE_ACCOUNT_MAX_AGE_SECONDS` they move to
 * `last_known_account` with `stale: true`, and `live_account` stays null, so a
 * consumer that only reads `live_account` can never present old money as live.
 */
export const LIVE_ACCOUNT_MAX_AGE_SECONDS = 15 * 60;

export type LiveAccountSourceRow = {
  id: string;
  label?: string | null;
  mt5_server?: string | null;
  metadata?: unknown;
};

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function ageSeconds(updatedAt: string, now: Date): number | null {
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now.getTime() - t) / 1000));
}

/** One account's `liveAccountState` as the legacy snapshot shape, or null when it has none. */
export function snapshotFromLiveState(row: LiveAccountSourceRow, now = new Date()): Mt5AccountSnapshot | null {
  const meta = rec(row.metadata);
  const state = rec(meta.liveAccountState);
  const summary = rec(meta.accountSummary);
  const updatedAt = typeof state.updatedAt === "string" ? state.updatedAt : null;
  if (!updatedAt) return null;
  const balance = num(state.balance) ?? num(summary.balance);
  const equity = num(state.equity) ?? num(summary.equity);
  if (balance == null && equity == null) return null;
  const currency =
    (typeof state.currency === "string" && state.currency) ||
    (typeof summary.currency === "string" && summary.currency) ||
    null;
  const age = ageSeconds(updatedAt, now);
  return {
    account_id: row.id,
    balance,
    equity,
    margin: num(state.margin) ?? num(summary.margin),
    free_margin: num(state.freeMargin) ?? num(summary.freeMargin),
    leverage: num(summary.leverage) ?? num(state.leverage),
    currency,
    server: row.mt5_server ?? (typeof summary.server === "string" ? summary.server : null),
    name: row.label ?? null,
    updated_at: updatedAt,
    source: "live_account_state",
    age_seconds: age,
    stale: age == null || age > LIVE_ACCOUNT_MAX_AGE_SECONDS,
  };
}

export type LiveAccountContext = {
  live: Mt5AccountSnapshot | null;
  lastKnown: Mt5AccountSnapshot | null;
};

/**
 * Pick the account to show: the trader's active one when it has live state,
 * else the most recently updated. A row from the old snapshots table only wins
 * when it is newer than that (a desktop terminal could still write it).
 */
export function pickLiveAccountContext(input: {
  accounts: LiveAccountSourceRow[];
  activeAccountId?: string | null;
  legacySnapshot?: Mt5AccountSnapshot | null;
  now?: Date;
}): LiveAccountContext {
  const now = input.now ?? new Date();
  const candidates = input.accounts
    .map((row) => snapshotFromLiveState(row, now))
    .filter((s): s is Mt5AccountSnapshot => s !== null);

  let chosen: Mt5AccountSnapshot | null =
    (input.activeAccountId ? candidates.find((c) => c.account_id === input.activeAccountId) : undefined) ??
    [...candidates].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0] ??
    null;

  const legacy = input.legacySnapshot ?? null;
  if (legacy && typeof legacy.updated_at === "string") {
    const legacyTime = Date.parse(legacy.updated_at);
    const chosenTime = chosen ? Date.parse(chosen.updated_at) : -Infinity;
    if (Number.isFinite(legacyTime) && legacyTime > chosenTime) {
      const age = ageSeconds(legacy.updated_at, now);
      chosen = {
        ...legacy,
        source: "mt5_account_snapshots",
        age_seconds: age,
        stale: age == null || age > LIVE_ACCOUNT_MAX_AGE_SECONDS,
      };
    }
  }

  if (!chosen) return { live: null, lastKnown: null };
  return chosen.stale ? { live: null, lastKnown: chosen } : { live: chosen, lastKnown: null };
}

export function formatAccountAge(seconds: number | null | undefined): string {
  if (seconds == null) return "at an unknown time";
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(seconds / 3600);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}

function money(currency: string | null, value: number | null): string {
  if (value == null) return "—";
  return `${currency ?? "USD"} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The account block of the AXE prompt. Fresh figures keep the LIVE heading with
 * their age; old ones are headed LAST KNOWN and say outright that they are not
 * current, so the model cannot quote them as the balance.
 */
export function liveAccountPromptBlock(context: {
  live_account: Mt5AccountSnapshot | null;
  last_known_account?: Mt5AccountSnapshot | null;
}): string | null {
  const fresh = context.live_account;
  const a = fresh ?? context.last_known_account ?? null;
  if (!a) return null;
  const isLive = fresh != null;
  const name = a.name ? ` (${a.name})` : "";
  const when = a.updated_at ? new Date(a.updated_at).toUTCString() : "an unknown time";
  const age = a.age_seconds != null ? formatAccountAge(a.age_seconds) : null;
  const heading = isLive
    ? `LIVE ACCOUNT${name} — synced ${when}${age ? ` (${age})` : ""}`
    : `LAST KNOWN ACCOUNT${name} — STALE, last synced ${when}${age ? ` (${age})` : ""}`;
  const figures = `Balance: ${money(a.currency, a.balance)}   Equity: ${money(a.currency, a.equity)}   Free margin: ${money(a.currency, a.free_margin)}   Leverage: ${a.leverage != null ? `1:${a.leverage}` : "—"}`;
  const warning = isLive
    ? ""
    : "\nThese figures are OUT OF DATE and are not the current balance. Never state them as the current balance or equity; say they are the last known figures and that the live sync is behind.";
  return `\n${heading}\n${figures}${warning}`;
}
