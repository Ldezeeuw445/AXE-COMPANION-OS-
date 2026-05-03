import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type JetAlertSeverity = 'info' | 'watch' | 'unusual';

export type JetAlert = {
  ticker: string;
  tail_number?: string | null;
  airport_icao?: string | null;
  landed_at?: string | null;
  reason?: string | null;
  severity: JetAlertSeverity;
  expires_at?: string | null;
};

export type JetAlertMap = Record<string, JetAlert>;

function nowIso() {
  return new Date().toISOString();
}

function stubAlerts(): JetAlert[] {
  // Placeholder until Supabase tables + Edge Function are live.
  // Keep small & deterministic so the UI doesn't feel spammy.
  return [
    {
      ticker: 'NVDA',
      tail_number: 'N123NV',
      airport_icao: 'KTEB',
      landed_at: nowIso(),
      reason: 'Unusual landing near NYC',
      severity: 'unusual',
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    },
  ];
}

function buildMap(rows: JetAlert[]): JetAlertMap {
  const out: JetAlertMap = {};
  for (const r of rows) {
    const t = String(r.ticker || '').toUpperCase().trim();
    if (!t) continue;
    out[t] = { ...r, ticker: t };
  }
  return out;
}

function isExpired(a: JetAlert) {
  if (!a.expires_at) return false;
  const ts = new Date(a.expires_at).getTime();
  return Number.isFinite(ts) ? ts <= Date.now() : false;
}

export function useJetAlerts(pollMs = 60_000): { alerts: JetAlertMap; source: 'supabase' | 'stub' } {
  const [rows, setRows] = useState<JetAlert[]>([]);
  const [source, setSource] = useState<'supabase' | 'stub'>(() =>
    isSupabaseConfigured() ? 'supabase' : 'stub'
  );

  useEffect(() => {
    let alive = true;

    async function loadSupabase() {
      try {
        const { data, error } = await supabase
          .from('jet_alerts')
          .select('ticker, tail_number, airport_icao, landed_at, reason, severity, expires_at')
          .gt('expires_at', new Date().toISOString());
        if (!alive) return;
        if (error) throw error;
        setSource('supabase');
        setRows((data as any[])?.map((d) => ({ ...d, ticker: String(d.ticker || '').toUpperCase() })) ?? []);
      } catch {
        // If Supabase isn't provisioned yet (table missing) we silently fall back to stub.
        if (!alive) return;
        setSource('stub');
        setRows(stubAlerts());
      }
    }

    function load() {
      if (isSupabaseConfigured()) loadSupabase();
      else {
        setSource('stub');
        setRows(stubAlerts());
      }
    }

    load();
    const t = window.setInterval(load, pollMs);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [pollMs]);

  const alerts = useMemo(() => {
    const filtered = rows.filter((a) => !isExpired(a));
    return buildMap(filtered);
  }, [rows]);

  return { alerts, source };
}

export function jetIconTone(severity: JetAlertSeverity): { fg: string; glow: string } {
  if (severity === 'unusual') return { fg: 'text-cyan-300', glow: 'shadow-[0_0_10px_rgba(34,211,238,0.35)]' };
  if (severity === 'watch') return { fg: 'text-yellow-300', glow: 'shadow-[0_0_10px_rgba(253,224,71,0.28)]' };
  return { fg: 'text-white/40', glow: 'shadow-none' };
}

