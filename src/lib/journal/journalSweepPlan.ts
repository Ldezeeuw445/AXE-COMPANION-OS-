/**
 * Pure planning for the journal sweep.
 *
 * The sweep used to read an arbitrary 2000 AXE labels (no filter, no order) and
 * then ask `autoJournalTrades` to look at each account's latest 20 trades. Once
 * a user had more labels than that, already-journaled trades looked unjournaled
 * (wasted model calls, crowding real work out of the account cap), and a
 * pending trade older than the latest 20 was never picked up at all.
 *
 * Now the sweep looks up labels only for the trades it fetched and hands each
 * account its exact pending trade ids.
 */

export type SweepTradeRow = {
  id: string | null;
  user_id: string | null;
  account_id: string | null;
};

export type SweepTarget = {
  userId: string;
  accountId: string;
  tradeIds: string[];
};

/** Split ids into chunks so `.in()` filters stay well under URL limits. */
export function chunkIds(ids: string[], size = 100): string[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * One target per (user, account) with the trades that still owe AXE a label,
 * in the order the trades were given (newest first). Each account gets at most
 * `maxTradesPerAccount` ids so one sweep cannot run away with the model budget.
 */
export function planJournalSweep(
  trades: SweepTradeRow[],
  labeledIds: Set<string>,
  maxTradesPerAccount = 20,
): { targets: SweepTarget[]; pendingTrades: number } {
  const byKey = new Map<string, SweepTarget>();
  let pendingTrades = 0;
  const seen = new Set<string>();
  for (const t of trades) {
    const id = t.id;
    if (!id || !t.user_id || !t.account_id) continue;
    if (labeledIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    pendingTrades += 1;
    const key = `${t.user_id}:${t.account_id}`;
    let target = byKey.get(key);
    if (!target) {
      target = { userId: t.user_id, accountId: t.account_id, tradeIds: [] };
      byKey.set(key, target);
    }
    if (target.tradeIds.length < maxTradesPerAccount) target.tradeIds.push(id);
  }
  return { targets: [...byKey.values()], pendingTrades };
}
