import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  isAxeFreeAiUnlimitedEnv,
  getLocalAxeFreeAiMeterUsage,
  getAxeFreeAiUsage,
  mapAxeChatQuotaStatusRpc,
  type AxeFreeAiUsage,
} from '@/lib/axeFreeAiUsage';

/**
 * AXE /app header meter: prefers Supabase `axe_chat_quota_status` (daily quota + exempt/pro),
 * falls back to localStorage preview when RPC unavailable. Env `VITE_AXE_AI_UNLIMITED=true` wins for whole build.
 */
export function useAxeChatQuotaMeter(userId: string | null, appMode: string) {
  const [usage, setUsage] = useState<AxeFreeAiUsage | null>(() => (appMode === 'axe' ? getAxeFreeAiUsage() : null));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (appMode !== 'axe') {
      setUsage(null);
      setLoading(false);
      return;
    }

    if (isAxeFreeAiUnlimitedEnv()) {
      setUsage({ kind: 'unlimited', reason: 'env' });
      setLoading(false);
      return;
    }

    if (!userId || !isSupabaseConfigured()) {
      setUsage(getLocalAxeFreeAiMeterUsage());
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('axe_chat_quota_status');
        if (!alive) return;
        if (!error && data != null) {
          const mapped = mapAxeChatQuotaStatusRpc(data);
          setUsage(mapped ?? getLocalAxeFreeAiMeterUsage());
        } else {
          setUsage(getLocalAxeFreeAiMeterUsage());
        }
      } catch {
        if (!alive) return;
        setUsage(getLocalAxeFreeAiMeterUsage());
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [userId, appMode]);

  return { usage, loading };
}
