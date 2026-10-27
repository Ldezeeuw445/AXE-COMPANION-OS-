/**
 * Last account figures on this device so Trade/Accounts can reopen balance
 * and equity offline, with a last-sync mark instead of a blank bar.
 */

const STORAGE_PREFIX = "axe.account.last.";

export type CachedAccountFigures = {
  accountId: string;
  savedAt: number;
  lastSyncAt: string | null;
  summary: {
    balance: number | null;
    equity: number | null;
    margin: number | null;
    freeMargin: number | null;
    marginLevel: number | null;
    currency: string | null;
  };
};

function storage(): Storage | null {
  try {
    const store = (globalThis as { localStorage?: Storage }).localStorage;
    if (!store) return null;
    return store;
  } catch {
    return null;
  }
}

function keyFor(accountId: string): string {
  return `${STORAGE_PREFIX}${accountId}`;
}

export function readLastAccountFigures(accountId: string): CachedAccountFigures | null {
  const store = storage();
  if (!store || !accountId) return null;
  try {
    const raw = store.getItem(keyFor(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAccountFigures;
    if (!parsed?.summary || parsed.accountId !== accountId) return null;
    if (!Number.isFinite(parsed.savedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastAccountFigures(snapshot: CachedAccountFigures): void {
  const store = storage();
  if (!store || !snapshot.accountId) return;
  if (snapshot.summary.balance == null && snapshot.summary.equity == null) return;
  try {
    store.setItem(keyFor(snapshot.accountId), JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}
