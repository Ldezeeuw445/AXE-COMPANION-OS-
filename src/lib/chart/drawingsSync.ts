/**
 * Pure last-write-wins merge for chart drawings.
 *
 * LocalStorage remains the cache/offline copy. When a signed-in user syncs,
 * local and remote rows are merged by id: the record with the later
 * `updatedAt` wins. Soft-deleted rows are tombstones so a delete on one
 * device can beat a stale copy on another.
 */

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SyncedDrawing = {
  id: string;
  symbol: string;
  timeframe: string | null;
  toolType: string;
  drawing: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
};

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export function parseUpdatedAtMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/** True when `candidate` is strictly newer than `current`. Equal timestamps are not newer. */
export function isNewerThan(candidateIso: string, currentIso: string): boolean {
  return parseUpdatedAtMs(candidateIso) > parseUpdatedAtMs(currentIso);
}

export function normalizeTimeframe(tf: string | null | undefined): string | null {
  if (tf == null) return null;
  const trimmed = tf.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function drawingStorageKey(symbol: string, timeframe: string | null): string {
  return `${normalizeSymbol(symbol)}.${normalizeTimeframe(timeframe) ?? ""}`;
}

/**
 * Non-UUID legacy local ids (Date.now()-random) cannot be the table PK.
 * Mint a UUID once so the row can upsert; callers rewrite localStorage.
 */
export function coerceDrawingIds(
  drawings: SyncedDrawing[],
  randomUuid: () => string = () => crypto.randomUUID(),
): { drawings: SyncedDrawing[]; changed: boolean } {
  let changed = false;
  const next = drawings.map((d) => {
    if (isUuid(d.id)) return d;
    changed = true;
    const id = randomUuid();
    return {
      ...d,
      id,
      drawing: { ...d.drawing, id },
    };
  });
  return { drawings: next, changed };
}

export function mergeDrawingsLastWriteWins(
  local: SyncedDrawing[],
  remote: SyncedDrawing[],
): { merged: SyncedDrawing[]; toPush: SyncedDrawing[] } {
  const mergedById = new Map<string, SyncedDrawing>();
  for (const row of remote) {
    mergedById.set(row.id, row);
  }

  const toPush: SyncedDrawing[] = [];
  for (const row of local) {
    const existing = mergedById.get(row.id);
    if (!existing) {
      mergedById.set(row.id, row);
      toPush.push(row);
      continue;
    }
    if (isNewerThan(row.updatedAt, existing.updatedAt)) {
      mergedById.set(row.id, row);
      toPush.push(row);
    }
  }

  return { merged: [...mergedById.values()], toPush };
}

/**
 * Persist a visible list over the previous raw list.
 * Missing previous ids become tombstones (new updatedAt). Existing tombstones
 * keep their timestamps so a later save of other drawings cannot resurrect
 * them in a LWW race.
 */
export function applyLocalSave(
  previous: SyncedDrawing[],
  nextVisible: SyncedDrawing[],
  nowIso: string,
): SyncedDrawing[] {
  const result: SyncedDrawing[] = nextVisible.map((row) => ({
    ...row,
    deleted: false,
  }));
  const seen = new Set(result.map((row) => row.id));

  for (const prev of previous) {
    if (seen.has(prev.id)) continue;
    if (prev.deleted) {
      result.push(prev);
    } else {
      result.push({ ...prev, deleted: true, updatedAt: nowIso });
    }
  }
  return result;
}

/** Visible rows for a chart. Null-timeframe drawings show on every tf of that symbol. */
export function visibleForChart(
  drawings: SyncedDrawing[],
  symbol: string,
  timeframe: string,
): SyncedDrawing[] {
  const sym = normalizeSymbol(symbol);
  const tf = normalizeTimeframe(timeframe);
  return drawings.filter((row) => {
    if (row.deleted) return false;
    if (normalizeSymbol(row.symbol) !== sym) return false;
    const rowTf = normalizeTimeframe(row.timeframe);
    return rowTf == null || rowTf === tf;
  });
}

export function groupByStorageKey(drawings: SyncedDrawing[]): Map<string, SyncedDrawing[]> {
  const groups = new Map<string, SyncedDrawing[]>();
  for (const row of drawings) {
    const key = drawingStorageKey(row.symbol, row.timeframe);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

export function parseStorageKeySuffix(suffix: string): { symbol: string; timeframe: string } | null {
  const lastDot = suffix.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const symbol = suffix.slice(0, lastDot);
  const timeframe = suffix.slice(lastDot + 1);
  if (!symbol) return null;
  return { symbol, timeframe };
}
