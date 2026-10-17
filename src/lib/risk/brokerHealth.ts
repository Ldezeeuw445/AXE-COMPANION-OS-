/**
 * Is the broker connection actually delivering, and does the trader know?
 *
 * On 2026-10-10 a MetaApi account was credit-suspended. MetaApi reported it as
 * `"The MetaApi account was not found. It may have been deleted"` every ten
 * minutes for eight days. The accounts page did show a red dot — but nothing
 * ever came *to* the trader, and the rest of the app carried on as if the data
 * were current: the journal stayed empty, the cockpit stayed stale, and the
 * only honest reading of the situation was available to whoever thought to
 * open one specific screen.
 *
 * A silent stale account is worse than an error, because every number the app
 * shows is quietly wrong. This decides when to say so.
 *
 * Dependency-free so it can be exercised with `node --experimental-strip-types`.
 */

export type BrokerHealthInput = {
  label: string | null;
  /** `user_broker_accounts.provider_status` */
  providerStatus: string | null;
  /** `user_broker_accounts.last_sync_at`, ISO. Null means it never synced. */
  lastSyncAt: string | null;
  /** How the account was linked — a paper account is not worth warning about. */
  connectionMethod: string | null;
};

export type BrokerHealthWarning = {
  /** `stale` = no data coming in. `failing` = the provider is refusing. */
  kind: "stale" | "failing";
  title: string;
  body: string;
  /** Hours since the last successful sync, when known. */
  hoursSinceSync: number | null;
};

/** Sync runs every ten minutes; six hours of silence is not a hiccup. */
const STALE_AFTER_HOURS = 6;

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  return (now.getTime() - then) / 3_600_000;
}

function looksFailing(status: string): boolean {
  return /fail|error|credential|unauthor|not_found|deleted|suspend/.test(status);
}

function looksTransient(status: string): boolean {
  return /provision|connect|sync|deploy|created|recover|orphan/.test(status);
}

/**
 * Returns a warning worth sending, or null.
 *
 * Deliberately quiet about paper accounts and about statuses that mean "busy":
 * a warning the trader cannot act on teaches them to ignore the next one.
 */
export function brokerHealthWarning(
  input: BrokerHealthInput,
  now: Date = new Date(),
): BrokerHealthWarning | null {
  const method = (input.connectionMethod ?? "").toLowerCase();
  if (method.includes("demo_paper") || method.includes("paper")) return null;

  const status = (input.providerStatus ?? "").toLowerCase();
  const name = input.label?.trim() || "your trading account";
  const hours = hoursSince(input.lastSyncAt, now);

  // The provider is actively refusing. Say so even if a sync landed recently,
  // because the next one will not.
  if (looksFailing(status)) {
    return {
      kind: "failing",
      title: `${name} is not connecting`,
      body:
        hours === null
          ? `Your broker connection is failing and has never synced. Open Accounts and reconnect — until then every number AXE shows you is out of date.`
          : `Your broker connection is failing. Last successful sync was ${describeAge(hours)} ago. Open Accounts and reconnect — until then every number AXE shows you is out of date.`,
      hoursSinceSync: hours,
    };
  }

  if (looksTransient(status) && (hours === null || hours < STALE_AFTER_HOURS)) return null;

  // Nothing is complaining, but nothing is arriving either. That is the case
  // that went unnoticed for eight days.
  if (hours !== null && hours >= STALE_AFTER_HOURS) {
    return {
      kind: "stale",
      title: `${name} has not synced in ${describeAge(hours)}`,
      body: `No new trades or balance updates have come in for ${describeAge(hours)}. Sync normally runs every ten minutes, so something is stuck. Open Accounts to check the connection.`,
      hoursSinceSync: hours,
    };
  }

  if (hours === null && status && !looksTransient(status)) {
    return {
      kind: "stale",
      title: `${name} has never synced`,
      body: `This account is linked but no data has ever arrived. Open Accounts and run the connection test.`,
      hoursSinceSync: null,
    };
  }

  return null;
}

function describeAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes`;
  if (hours < 48) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}
