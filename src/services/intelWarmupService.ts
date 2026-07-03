import "server-only";

import { getSupabaseKey } from "@/lib/env";

const WARMUP_ACTIONS = [
  "insiderTrades",
  "senateTrades",
  "darkPoolPrints",
  "unusualOptions",
  "marketTide",
  "corporateJets",
  "vesselTracking",
  "conflictEvents",
  "energyFlows",
  "cyberThreats",
  "militaryRadar",
  "emergencyMonitor",
] as const;

const PROXY_TIMEOUT_MS = 25_000;

export type IntelWarmupSummary = {
  warmed: number;
  failed: number;
  results: Array<{ action: string; ok: boolean; error?: string }>;
};

export async function runIntelWarmupBatch(): Promise<IntelWarmupSummary> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = getSupabaseKey();
  if (!base || !anonKey) {
    return { warmed: 0, failed: WARMUP_ACTIONS.length, results: [{ action: "env", ok: false, error: "missing_supabase_env" }] };
  }

  const results: IntelWarmupSummary["results"] = [];
  let warmed = 0;
  let failed = 0;

  for (const action of WARMUP_ACTIONS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/functions/v1/intel-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        signal: ctrl.signal,
        body: JSON.stringify({ action, args: {} }),
      });
      if (!res.ok) {
        failed += 1;
        results.push({ action, ok: false, error: `http_${res.status}` });
        continue;
      }
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok === false) {
        failed += 1;
        results.push({ action, ok: false, error: json.error ?? "proxy_error" });
        continue;
      }
      warmed += 1;
      results.push({ action, ok: true });
    } catch (e) {
      failed += 1;
      results.push({
        action,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return { warmed, failed, results };
}
