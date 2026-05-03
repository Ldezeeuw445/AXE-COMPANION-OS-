/**
 * Trade journal — browser-local persistence (Phase 3). No server schema required.
 * Sync MAIN dashboard preview via `loadJournalEntries` + `journalSnapshot`.
 */

export const JOURNAL_STORAGE_KEY = 'tradingos.journal.entries.v1';

export type JournalRating = 'perfect' | 'good' | 'ok' | 'poor' | 'emotional';

export type JournalEntry = {
  id: string;
  symbol: string;
  createdAt: string;
  notes: string;
  rating?: JournalRating;
  tags: string[];
  pnl?: number;
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `je_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isEntry(x: unknown): x is JournalEntry {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.symbol === 'string' &&
    typeof o.notes === 'string' &&
    typeof o.createdAt === 'string'
  );
}

export function loadJournalEntries(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j
      .filter(isEntry)
      .map((e) => ({ ...e, tags: Array.isArray(e.tags) ? e.tags.map(String) : [] }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

function notifyJournalChanged(): void {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tos-journal-changed'));
  } catch {
    /* noop */
  }
}

/** Call after cloud journal mutations so MAIN preview stays in sync. */
export function emitJournalChanged(): void {
  notifyJournalChanged();
}

export function saveJournalEntries(entries: JournalEntry[]): void {
  try {
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
    notifyJournalChanged();
  } catch {
    /* quota / private mode */
  }
}

export function addJournalEntry(
  partial: Omit<JournalEntry, 'id' | 'createdAt'> & { createdAt?: string },
): JournalEntry {
  const entry: JournalEntry = {
    id: newId(),
    createdAt: partial.createdAt ?? new Date().toISOString(),
    symbol: partial.symbol.trim(),
    notes: partial.notes.trim(),
    rating: partial.rating,
    tags: Array.isArray(partial.tags) ? partial.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    pnl: typeof partial.pnl === 'number' && Number.isFinite(partial.pnl) ? partial.pnl : undefined,
  };
  saveJournalEntries([entry, ...loadJournalEntries()]);
  return entry;
}

export function deleteJournalEntry(id: string): void {
  saveJournalEntries(loadJournalEntries().filter((e) => e.id !== id));
}

export function journalSnapshot(entries: JournalEntry[]): {
  count: number;
  completion: number;
  topTag: string | null;
} {
  const n = entries.length;
  if (!n) return { count: 0, completion: 0, topTag: null };
  const rated = entries.filter((e) => e.rating).length;
  const completion = Math.round((rated / n) * 100);
  const tagCount: Record<string, number> = {};
  for (const e of entries) {
    for (const t of e.tags) {
      const k = t.toLowerCase();
      if (!k) continue;
      tagCount[k] = (tagCount[k] ?? 0) + 1;
    }
  }
  let top: string | null = null;
  let topN = 0;
  for (const [k, c] of Object.entries(tagCount)) {
    if (c > topN) {
      topN = c;
      top = k;
    }
  }
  return {
    count: n,
    completion,
    topTag: top ? top.charAt(0).toUpperCase() + top.slice(1) : null,
  };
}
