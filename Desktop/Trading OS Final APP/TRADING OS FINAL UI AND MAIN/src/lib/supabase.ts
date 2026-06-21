/**
 * Supabase Client
 *
 * Creates a Supabase client from env vars.
 * Export isSupabaseConfigured helper.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(url || 'http://placeholder', key || 'placeholder', {
  auth: {
    // Ensure sessions are persisted in the browser (Local Storage).
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'trading-os-auth',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

// Dev-only: make it easy to inspect session/token in the browser console.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).__supabase = supabase;
  // Back-compat for accidental extra underscore usage while debugging.
  (window as any).___supabase = supabase;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && key && url !== 'http://placeholder');
}
