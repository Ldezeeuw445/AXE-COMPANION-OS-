/**
 * Per-trading-account scope for alerts, notes, chart drawings and journal
 * entries (`user_alerts`, `notes`, `chart_drawings`, `user_journal_entries`).
 *
 * Companion's active account lives on `user_workspace_preferences.active_account_id`.
 * NULL `account_id` on a row still means "applies to every account" — existing
 * rows keep showing after the column was added. When no account is active,
 * writes stay NULL and reads are unfiltered (today's behaviour).
 */

const ACCOUNT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeAccountId(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return ACCOUNT_UUID_RE.test(trimmed) ? trimmed : null;
}

/** Value to store on create. Null when nothing is active — same as today. */
export function accountIdWriteValue(activeAccountId: string | null | undefined): string | null {
  return normalizeAccountId(activeAccountId);
}

/**
 * PostgREST `or` clause: this account's rows plus legacy NULL rows.
 * Null means "do not filter".
 */
export function accountIdReadOrFilter(activeAccountId: string | null | undefined): string | null {
  const id = normalizeAccountId(activeAccountId);
  if (!id) return null;
  return `account_id.eq.${id},account_id.is.null`;
}

export function applyAccountIdReadFilter<Q>(
  query: Q,
  activeAccountId: string | null | undefined,
): Q {
  const filter = accountIdReadOrFilter(activeAccountId);
  if (!filter) return query;
  return (query as Q & { or: (value: string) => Q }).or(filter);
}

/** In-memory equivalent of the read filter (tests and client caches). */
export function rowMatchesActiveAccount(
  rowAccountId: string | null | undefined,
  activeAccountId: string | null | undefined,
): boolean {
  const active = normalizeAccountId(activeAccountId);
  if (!active) return true;
  const row = String(rowAccountId ?? "").trim();
  if (!row) return true;
  return normalizeAccountId(row) === active;
}

/**
 * Upsert helper: new rows take the active account; existing rows keep the
 * `account_id` they already have (including legacy NULL).
 */
export function accountIdForUpsertRow(
  existing: { account_id: string | null } | null,
  activeAccountId: string | null | undefined,
): string | null {
  if (existing) return existing.account_id;
  return accountIdWriteValue(activeAccountId);
}

type WorkspacePrefsClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{
          data: { active_account_id?: string | null } | null;
        }>;
      };
    };
  };
};

/** Active trading account for this user, or null when none is selected. */
export async function loadActiveAccountId(
  supabase: { from: (table: string) => unknown },
  userId: string,
): Promise<string | null> {
  const client = supabase as WorkspacePrefsClient;
  const { data } = await client
    .from("user_workspace_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  return normalizeAccountId(data?.active_account_id);
}
