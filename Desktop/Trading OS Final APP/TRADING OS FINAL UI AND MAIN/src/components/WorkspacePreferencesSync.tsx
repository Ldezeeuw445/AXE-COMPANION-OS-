import { useEffect, useRef } from 'react';
import { useBeginner } from '@/lib/beginnerMode';
import {
  canSyncWorkspacePreferences,
  fetchWorkspacePreferences,
  migrateLocalWorkspacePreferencesIfNeeded,
  upsertWorkspacePreferences,
} from '@/lib/userPreferencesCloud';
import { useSupabaseSession } from '@/lib/supabaseAuth';
import { useSymbol } from '@/contexts/SymbolContext';
import { useTerminalWatchlist } from '@/contexts/WatchlistContext';
import { getAppMode } from '@/lib/appMode';

const DEFAULT_RECENTS = ['XAU/USD', 'EUR/USD', 'GBP/USD', 'BTC/USD', 'US30'];

/**
 * When Supabase is configured and the user is signed in, loads workspace prefs
 * (watchlist, symbol/recents, beginner) from `user_workspace_preferences` and
 * debounces writes back. Guests stay on localStorage-only paths.
 */
export function WorkspacePreferencesSync() {
  const { userId } = useSupabaseSession();
  const { groups, setGroups } = useTerminalWatchlist();
  const { symbol, recentSymbols, hydrateFromWorkspaceServer } = useSymbol();
  const { beginner, setBeginner } = useBeginner();
  const prefsLoaded = useRef(false);
  const activeAccountIdRef = useRef<string | null>(null);

  useEffect(() => {
    prefsLoaded.current = false;
    if (!userId || !canSyncWorkspacePreferences(userId)) {
      prefsLoaded.current = true;
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await migrateLocalWorkspacePreferencesIfNeeded(userId, DEFAULT_RECENTS);
        if (cancelled) return;
        const row = await fetchWorkspacePreferences(userId);
        if (cancelled) return;
        if (row) {
          setGroups(row.watchlist_groups);
          // AXE Companion uses its own symbol keys; do not pull the desk’s active_symbol (e.g. ES) from cloud.
          if (getAppMode() !== 'axe') {
            hydrateFromWorkspaceServer(row.active_symbol || 'XAU/USD', row.recent_symbols);
          }
          setBeginner(row.beginner_mode);
          activeAccountIdRef.current = row.active_account_id ?? null;
        }
      } catch (err) {
        console.warn('[WorkspacePreferencesSync] pull', err);
      } finally {
        if (!cancelled) prefsLoaded.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, setGroups, hydrateFromWorkspaceServer, setBeginner]);

  useEffect(() => {
    if (!userId || !prefsLoaded.current || !canSyncWorkspacePreferences(userId)) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          if (getAppMode() === 'axe') {
            const cur = await fetchWorkspacePreferences(userId);
            await upsertWorkspacePreferences(userId, {
              watchlist_groups: groups,
              active_symbol: cur?.active_symbol ?? 'XAU/USD',
              recent_symbols:
                Array.isArray(cur?.recent_symbols) && cur.recent_symbols.length
                  ? cur.recent_symbols
                  : DEFAULT_RECENTS,
              beginner_mode: beginner,
              active_account_id: activeAccountIdRef.current,
            });
            return;
          }
          await upsertWorkspacePreferences(userId, {
            watchlist_groups: groups,
            active_symbol: symbol,
            recent_symbols: recentSymbols,
            beginner_mode: beginner,
            active_account_id: activeAccountIdRef.current,
          });
        } catch (err) {
          console.warn('[WorkspacePreferencesSync] save', err);
        }
      })();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [userId, groups, symbol, recentSymbols, beginner]);

  return null;
}
