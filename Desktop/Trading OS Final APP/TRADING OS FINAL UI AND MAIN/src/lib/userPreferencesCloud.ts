/**
 * Supabase-backed workspace preferences (watchlist groups, symbol/recents, beginner).
 * Guests keep using localStorage via existing providers.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  cloneDefaultGroups,
  loadWatchlistGroupsFromStorage,
  normalizeWatchlistGroups,
  type WatchlistGroups,
} from '@/lib/watchlistDefaults';
import { getAppMode } from '@/lib/appMode';

function symbolStorageKeys(): { active: string; recent: string } {
  return getAppMode() === 'axe'
    ? { active: 'axe.activeSymbol', recent: 'axe.recentSymbols' }
    : { active: 'tradingos.activeSymbol', recent: 'tradingos.recentSymbols' };
}

const BEGINNER_KEY = 'tos_beginner';

export type WorkspacePreferencesRow = {
  user_id: string;
  watchlist_groups: WatchlistGroups;
  active_symbol: string | null;
  recent_symbols: string[];
  beginner_mode: boolean;
  active_account_id?: string | null;
  updated_at: string;
};

function prefsMigratedKey(userId: string): string {
  return `tos_prefs_cloud_migrated_${userId}`;
}

function readLocalActiveSymbol(): string {
  try {
    const s = localStorage.getItem(symbolStorageKeys().active);
    if (s?.trim()) return s.trim();
  } catch {
    /* noop */
  }
  return 'XAU/USD';
}

function readLocalRecents(fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(symbolStorageKeys().recent);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr) && arr.length) return arr.map(String).filter(Boolean).slice(0, 10);
    }
  } catch {
    /* noop */
  }
  return fallback;
}

function readLocalBeginner(): boolean {
  try {
    return localStorage.getItem(BEGINNER_KEY) === '1';
  } catch {
    return false;
  }
}

export async function fetchWorkspacePreferences(userId: string): Promise<WorkspacePreferencesRow | null> {
  const { data, error } = await supabase
    .from('user_workspace_preferences')
    .select('user_id,watchlist_groups,active_symbol,recent_symbols,beginner_mode,active_account_id,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const wg = data.watchlist_groups as unknown;
  const groups = normalizeWatchlistGroups(
    wg && typeof wg === 'object' ? (wg as WatchlistGroups) : cloneDefaultGroups(),
  );
  const rs = data.recent_symbols as unknown;
  const recents = Array.isArray(rs) ? rs.map(String).filter(Boolean) : [];
  return {
    user_id: data.user_id,
    watchlist_groups: groups,
    active_symbol: data.active_symbol ?? null,
    recent_symbols: recents,
    beginner_mode: Boolean(data.beginner_mode),
    active_account_id: (data as { active_account_id?: string | null }).active_account_id ?? null,
    updated_at: data.updated_at,
  };
}

export async function upsertWorkspacePreferences(
  userId: string,
  patch: {
    watchlist_groups: WatchlistGroups;
    active_symbol: string;
    recent_symbols: string[];
    beginner_mode: boolean;
    active_account_id?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from('user_workspace_preferences').upsert(
    {
      user_id: userId,
      watchlist_groups: patch.watchlist_groups,
      active_symbol: patch.active_symbol,
      recent_symbols: patch.recent_symbols,
      beginner_mode: patch.beginner_mode,
      active_account_id: patch.active_account_id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

/** One-shot: if no server row, seed from localStorage then mark session. */
export async function migrateLocalWorkspacePreferencesIfNeeded(
  userId: string,
  defaultRecents: string[],
): Promise<void> {
  if (typeof sessionStorage === 'undefined') return;
  if (sessionStorage.getItem(prefsMigratedKey(userId))) return;

  const existing = await fetchWorkspacePreferences(userId);
  if (existing) {
    sessionStorage.setItem(prefsMigratedKey(userId), '1');
    return;
  }

  const storedWl = loadWatchlistGroupsFromStorage();
  const groups = storedWl ? normalizeWatchlistGroups(storedWl) : cloneDefaultGroups();
  const active = readLocalActiveSymbol();
  const recents = readLocalRecents(defaultRecents);
  const beginner = readLocalBeginner();

  const { error } = await supabase.from('user_workspace_preferences').upsert(
    {
      user_id: userId,
      watchlist_groups: groups,
      active_symbol: active,
      recent_symbols: recents,
      beginner_mode: beginner,
      active_account_id: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
  sessionStorage.setItem(prefsMigratedKey(userId), '1');
}

export function canSyncWorkspacePreferences(userId: string | null): boolean {
  return Boolean(userId && isSupabaseConfigured());
}
