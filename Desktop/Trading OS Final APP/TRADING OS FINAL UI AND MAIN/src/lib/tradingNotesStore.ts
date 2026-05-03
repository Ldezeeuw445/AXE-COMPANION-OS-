/**
 * Quick notes — browser-local (Phase 3).
 */

export const NOTES_STORAGE_KEY = 'tradingos.notes.entries.v1';

export type TradingNote = {
  id: string;
  title: string;
  body: string;
  symbol?: string;
  updatedAt: string;
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `tn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isNote(x: unknown): x is TradingNote {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.title === 'string' && typeof o.body === 'string' && typeof o.updatedAt === 'string';
}

export function loadNotes(): TradingNote[] {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j.filter(isNote).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  } catch {
    return [];
  }
}

export function saveNotes(notes: TradingNote[]): void {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    /* ignore */
  }
}

export function upsertNote(note: TradingNote): void {
  const rest = loadNotes().filter((n) => n.id !== note.id);
  saveNotes([note, ...rest]);
}

export function deleteNote(id: string): void {
  saveNotes(loadNotes().filter((n) => n.id !== id));
}

export function createNote(partial: { title: string; body: string; symbol?: string }): TradingNote {
  const now = new Date().toISOString();
  const note: TradingNote = {
    id: newId(),
    title: partial.title.trim() || 'Untitled',
    body: partial.body.trim(),
    symbol: partial.symbol?.trim() || undefined,
    updatedAt: now,
  };
  upsertNote(note);
  return note;
}
