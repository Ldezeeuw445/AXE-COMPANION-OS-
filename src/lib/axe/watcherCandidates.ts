/**
 * Who the proactive watcher should actually look at.
 *
 * Filling the cap from `user_broker_accounts` with no ORDER BY meant the same
 * idle accounts were checked every 15 minutes while the people who had just
 * closed a trade were never reached. Activity sources go first; the rest of
 * the cap is a rotation over everyone else so a 30-user budget still walks
 * the whole book over successive runs.
 */

export const TRADE_CLOSE_LOOKBACK_MS = 6 * 60 * 60 * 1000;

export type WatcherCandidateSources = {
  recentTradeUserIds: string[];
  pendingExecUserIds: string[];
  openPositionUserIds: string[];
  staleConnectionUserIds: string[];
  activeAccountUserIds: string[];
  pushUserIds: string[];
  /** Stable clock for rotation. Tests inject this. */
  nowMs?: number;
};

export function collectWatcherCandidates(
  sources: WatcherCandidateSources,
  maxUsers: number,
): string[] {
  const cap = Math.max(0, Math.floor(maxUsers));
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (ids: string[]) => {
    for (const raw of ids) {
      if (out.length >= cap) return;
      const id = typeof raw === "string" ? raw.trim() : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  };

  add(sources.recentTradeUserIds);
  add(sources.pendingExecUserIds);
  add(sources.openPositionUserIds);
  add(sources.staleConnectionUserIds);

  if (out.length < cap) {
    add(rotateList(sources.activeAccountUserIds, sources.nowMs ?? Date.now(), cap));
  }
  add(sources.pushUserIds);
  return out;
}

/** Rotate so successive 15-minute runs walk past the same first page of ids. */
export function rotateList(ids: string[], nowMs: number, window: number): string[] {
  if (ids.length === 0) return [];
  const step = Math.max(1, window);
  const offset = Math.floor(nowMs / (15 * 60 * 1000)) % Math.ceil(ids.length / step) * step;
  const start = offset % ids.length;
  return ids.slice(start).concat(ids.slice(0, start));
}

export function tradeCloseEventKey(trade: { id: string; external_trade_id?: string | null }): string {
  const ext = typeof trade.external_trade_id === "string" ? trade.external_trade_id.trim() : "";
  return `trade_close:${ext || trade.id}`;
}

export function isBrokerConnectionStale(lastSyncAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!lastSyncAt) return true;
  const t = Date.parse(lastSyncAt);
  if (!Number.isFinite(t)) return true;
  return nowMs - t > 30 * 60 * 1000;
}
