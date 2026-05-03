/**
 * Cloud persistence for notes + journal (Supabase, per authenticated user).
 * Guests keep using localStorage via trading*Store modules.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { JournalEntry, JournalRating } from '@/lib/tradingJournalStore';
import {
  JOURNAL_STORAGE_KEY,
  addJournalEntry,
  deleteJournalEntry,
  loadJournalEntries as loadLocalJournal,
  emitJournalChanged,
} from '@/lib/tradingJournalStore';
import type { TradingNote } from '@/lib/tradingNotesStore';
import {
  deleteNote,
  loadNotes as loadLocalNotes,
  NOTES_STORAGE_KEY,
  upsertNote as upsertLocalNote,
} from '@/lib/tradingNotesStore';

function migratedKey(userId: string, kind: 'notes' | 'journal'): string {
  return `tos_cloud_migrated_${kind}_${userId}`;
}

function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export async function migrateLocalNotesIfNeeded(userId: string): Promise<void> {
  if (typeof sessionStorage === 'undefined') return;
  if (sessionStorage.getItem(migratedKey(userId, 'notes'))) return;
  const local = loadLocalNotes();
  if (local.length === 0) {
    sessionStorage.setItem(migratedKey(userId, 'notes'), '1');
    return;
  }
  const { data: existing, error: selErr } = await supabase.from('user_trading_notes').select('id').eq('user_id', userId);
  if (selErr) throw selErr;
  const have = new Set((existing ?? []).map((r: { id: string }) => r.id));
  const rows = local
    .filter((n) => !have.has(n.id))
    .map((n) => ({
      id: n.id,
      user_id: userId,
      title: n.title,
      body: n.body,
      symbol: n.symbol ?? null,
      updated_at: n.updatedAt,
    }));
  if (rows.length > 0) {
    const { error } = await supabase.from('user_trading_notes').insert(rows);
    if (error) throw error;
  }
  try {
    localStorage.removeItem(NOTES_STORAGE_KEY);
  } catch {
    /* noop */
  }
  sessionStorage.setItem(migratedKey(userId, 'notes'), '1');
}

export async function migrateLocalJournalIfNeeded(userId: string): Promise<void> {
  if (typeof sessionStorage === 'undefined') return;
  if (sessionStorage.getItem(migratedKey(userId, 'journal'))) return;
  const local = loadLocalJournal();
  if (local.length === 0) {
    sessionStorage.setItem(migratedKey(userId, 'journal'), '1');
    return;
  }
  const { data: existing, error: selErr } = await supabase.from('user_journal_entries').select('id').eq('user_id', userId);
  if (selErr) throw selErr;
  const have = new Set((existing ?? []).map((r: { id: string }) => r.id));
  const rows = local
    .filter((e) => !have.has(e.id))
    .map((e) => ({
      id: e.id,
      user_id: userId,
      symbol: e.symbol,
      notes: e.notes,
      rating: e.rating ?? null,
      tags: e.tags,
      pnl: e.pnl ?? null,
      created_at: e.createdAt,
    }));
  if (rows.length > 0) {
    const { error } = await supabase.from('user_journal_entries').insert(rows);
    if (error) throw error;
  }
  try {
    localStorage.removeItem(JOURNAL_STORAGE_KEY);
  } catch {
    /* noop */
  }
  sessionStorage.setItem(migratedKey(userId, 'journal'), '1');
}

export async function fetchCloudNotes(userId: string): Promise<TradingNote[]> {
  const { data, error } = await supabase
    .from('user_trading_notes')
    .select('id,title,body,symbol,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: { id: string; title: string; body: string; symbol: string | null; updated_at: string }) => ({
    id: row.id,
    title: row.title ?? '',
    body: row.body ?? '',
    symbol: row.symbol ?? undefined,
    updatedAt: row.updated_at,
  }));
}

export async function fetchCloudJournal(userId: string): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from('user_journal_entries')
    .select('id,symbol,notes,rating,tags,pnl,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(
    (row: {
      id: string;
      symbol: string;
      notes: string;
      rating: string | null;
      tags: unknown;
      pnl: number | null;
      created_at: string;
    }) => ({
      id: row.id,
      symbol: row.symbol,
      notes: row.notes,
      rating: (row.rating as JournalRating | undefined) || undefined,
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      pnl: row.pnl != null && Number.isFinite(Number(row.pnl)) ? Number(row.pnl) : undefined,
      createdAt: row.created_at,
    }),
  );
}

export async function loadNotesHybrid(userId: string | null): Promise<TradingNote[]> {
  if (!userId || !isSupabaseConfigured()) return loadLocalNotes();
  await migrateLocalNotesIfNeeded(userId);
  return fetchCloudNotes(userId);
}

export async function loadJournalHybrid(userId: string | null): Promise<JournalEntry[]> {
  if (!userId || !isSupabaseConfigured()) return loadLocalJournal();
  await migrateLocalJournalIfNeeded(userId);
  return fetchCloudJournal(userId);
}

export async function saveNoteHybrid(userId: string | null, note: TradingNote): Promise<void> {
  if (!userId || !isSupabaseConfigured()) {
    upsertLocalNote(note);
    return;
  }
  const { error } = await supabase.from('user_trading_notes').upsert(
    {
      id: note.id,
      user_id: userId,
      title: note.title,
      body: note.body,
      symbol: note.symbol ?? null,
      updated_at: note.updatedAt,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

export async function deleteNoteHybrid(userId: string | null, id: string): Promise<void> {
  if (!userId || !isSupabaseConfigured()) {
    deleteNote(id);
    return;
  }
  const { error } = await supabase.from('user_trading_notes').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function createNoteHybrid(
  userId: string | null,
  partial: { title: string; body: string; symbol?: string },
): Promise<TradingNote> {
  const now = new Date().toISOString();
  const note: TradingNote = {
    id: newUuid(),
    title: partial.title.trim() || 'Untitled',
    body: partial.body.trim(),
    symbol: partial.symbol?.trim() || undefined,
    updatedAt: now,
  };
  await saveNoteHybrid(userId, note);
  return note;
}

export async function insertJournalHybrid(
  userId: string | null,
  partial: Omit<JournalEntry, 'id' | 'createdAt'> & { createdAt?: string },
): Promise<JournalEntry> {
  if (!userId || !isSupabaseConfigured()) {
    return addJournalEntry(partial);
  }
  const entry: JournalEntry = {
    id: newUuid(),
    createdAt: partial.createdAt ?? new Date().toISOString(),
    symbol: partial.symbol.trim(),
    notes: partial.notes.trim(),
    rating: partial.rating,
    tags: Array.isArray(partial.tags) ? partial.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    pnl: typeof partial.pnl === 'number' && Number.isFinite(partial.pnl) ? partial.pnl : undefined,
  };
  const { error } = await supabase.from('user_journal_entries').insert({
    id: entry.id,
    user_id: userId,
    symbol: entry.symbol,
    notes: entry.notes,
    rating: entry.rating ?? null,
    tags: entry.tags,
    pnl: entry.pnl ?? null,
    created_at: entry.createdAt,
  });
  if (error) throw error;
  emitJournalChanged();
  return entry;
}

export async function deleteJournalHybrid(userId: string | null, id: string): Promise<void> {
  if (!userId || !isSupabaseConfigured()) {
    deleteJournalEntry(id);
    return;
  }
  const { error } = await supabase.from('user_journal_entries').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
  emitJournalChanged();
}
