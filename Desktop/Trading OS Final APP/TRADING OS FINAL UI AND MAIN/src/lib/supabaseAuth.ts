import { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type TradingOsProfile = {
  id: string;
  display_name: string | null;
  default_symbols: string[] | null;
  default_timeframe: string | null;
  onboarding_complete: boolean | null;
};

export function useSupabaseSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function boot() {
      if (!isSupabaseConfigured()) {
        if (!alive) return;
        setUserId(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setUserId(data.user?.id ?? null);
      setUserEmail(data.user?.email ?? null);
      setLoading(false);
    }

    boot();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { userId, userEmail, loading };
}

export function useTradingOsProfile(userId: string | null) {
  const [profile, setProfile] = useState<TradingOsProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!userId || !isSupabaseConfigured()) {
        setProfile(null);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name, default_symbols, default_timeframe, onboarding_complete')
          .eq('id', userId)
          .maybeSingle();
        if (!alive) return;
        if (error) throw error;
        setProfile((data as TradingOsProfile) ?? null);
      } catch {
        if (!alive) return;
        setProfile(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [userId]);

  const onboardingComplete = useMemo(() => Boolean(profile?.onboarding_complete), [profile]);
  return { profile, loading, onboardingComplete };
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signUpWithPassword(email: string, password: string, displayName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: displayName ? { data: { display_name: displayName } } : undefined,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function ensureProfileBasics() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  const user = data.user;
  if (!user) return;

  const displayName =
    (user.user_metadata as any)?.display_name ||
    (user.user_metadata as any)?.name ||
    null;

  // Only write columns we know exist in this app's contract.
  // (Some projects also have `email`, but we don't require it.)
  const patch: Partial<TradingOsProfile> = {};
  if (displayName) patch.display_name = String(displayName);

  if (Object.keys(patch).length === 0) return;
  await supabase.from('profiles').upsert({ id: user.id, ...patch });
}

export async function upsertProfileOnboarding(userId: string, patch: Partial<TradingOsProfile>) {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    ...patch,
  });
  if (error) throw new Error(error.message);
}

