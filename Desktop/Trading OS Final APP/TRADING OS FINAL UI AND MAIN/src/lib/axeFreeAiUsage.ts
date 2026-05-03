/**
 * AXE AI meter on `/app`:
 * - **Production (per user):** Supabase `axe_chat_quota_status` + `axe_user_entitlements.chat_quota_exempt`
 *   (set in Dashboard → SQL for your UUID and any tester). Server enforcement is `axe_chat_try_consume` in Companion.
 * - **Whole build (optional):** `VITE_AXE_AI_UNLIMITED=true` — everyone on that deploy sees unlimited (dev only).
 * - **Offline preview:** localStorage counter when not signed in or RPC fails (labelled “/ mo”; not enforced server-side).
 */

import { isSupabaseConfigured } from '@/lib/supabase';

const STORAGE_KEY = 'axe_free_ai_queries_v1';
const FREE_LIMIT = 20;

function envFlagTrue(v: string | undefined): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/** Whole-Vite-build unlimited (use sparingly; prefer `chat_quota_exempt` per user in Supabase). */
export function isAxeFreeAiUnlimitedEnv(): boolean {
  return envFlagTrue(import.meta.env.VITE_AXE_AI_UNLIMITED);
}

/** @deprecated use isAxeFreeAiUnlimitedEnv */
export function isAxeFreeAiUnlimited(): boolean {
  return isAxeFreeAiUnlimitedEnv();
}

export type AxeFreeAiUsage =
  | { kind: 'unlimited'; reason: 'env' | 'exempt' | 'pro' }
  | { kind: 'metered'; used: number; limit: number; period: 'month' | 'day_utc'; monthLabel?: string };

type Stored = {
  month: string;
  count: number;
};

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { month: currentMonthKey(), count: 0 };
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const month = typeof parsed.month === 'string' ? parsed.month : currentMonthKey();
    const count = typeof parsed.count === 'number' && Number.isFinite(parsed.count) ? Math.max(0, parsed.count) : 0;
    return { month, count };
  } catch {
    return { month: currentMonthKey(), count: 0 };
  }
}

function writeStored(s: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

/** Local-only meter (monthly placeholder) for signed-out / RPC failure. */
export function getLocalAxeFreeAiMeterUsage(): AxeFreeAiUsage {
  const now = currentMonthKey();
  let s = readStored();
  if (s.month !== now) {
    s = { month: now, count: 0 };
    writeStored(s);
  }
  return {
    kind: 'metered',
    used: Math.min(s.count, FREE_LIMIT),
    limit: FREE_LIMIT,
    period: 'month',
    monthLabel: s.month,
  };
}

/** Map `axe_chat_quota_status()` JSON to UI shape. Returns null if payload is unusable. */
export function mapAxeChatQuotaStatusRpc(data: unknown): AxeFreeAiUsage | null {
  if (!data || typeof data !== 'object') return null;
  const j = data as Record<string, unknown>;
  if (j.ok !== true) return null;
  const plan = String(j.plan ?? 'free');
  if (plan === 'exempt' || plan === 'pro' || Number(j.remaining) === -1) {
    if (plan === 'pro') return { kind: 'unlimited', reason: 'pro' };
    if (plan === 'exempt') return { kind: 'unlimited', reason: 'exempt' };
    return { kind: 'unlimited', reason: 'pro' };
  }
  const limit = Math.max(0, Number(j.limit ?? 20));
  const used = Math.max(0, Number(j.used ?? 0));
  return { kind: 'metered', used, limit, period: 'day_utc' };
}

/** Sync helper for non-React callers; prefers env unlimited, else local month meter. */
export function getAxeFreeAiUsage(): AxeFreeAiUsage {
  if (isAxeFreeAiUnlimitedEnv()) return { kind: 'unlimited', reason: 'env' };
  return getLocalAxeFreeAiMeterUsage();
}

/**
 * Client-side bump for the **local** preview only.
 * When Supabase is configured, chat counting is server-side (`axe_chat_try_consume`); this becomes a no-op to avoid drift.
 */
export function bumpAxeFreeAiQueryCount(delta = 1): void {
  if (isAxeFreeAiUnlimitedEnv()) return;
  if (isSupabaseConfigured()) return;
  const now = currentMonthKey();
  let s = readStored();
  if (s.month !== now) s = { month: now, count: 0 };
  s.count = Math.max(0, s.count + delta);
  writeStored(s);
}
