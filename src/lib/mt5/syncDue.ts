import { liveAccountDayKey } from "@/lib/mt5/liveAccountSnapshot";

/**
 * Whether the background sync should pick this account up on this run.
 *
 * Two reasons, either is enough:
 *  - age: the last successful sync is older than `minAgeMs`.
 *  - broker-day roll: `liveAccountState` still holds yesterday's day anchors.
 *    The auto-trade guard only measures the daily loss from an anchor taken
 *    within 15 minutes of the broker-day open (`dayAnchorOnTime`), so the first
 *    run after the open must sync even when the previous one was minutes ago.
 *    Without this, a run that happened to start 9 minutes before the open
 *    skipped the account (not yet 10 minutes old) and the anchor landed late.
 */
export type SyncDueReason = "never" | "age" | "day_roll";

export function syncDueReason(input: {
  lastSyncAt?: string | null;
  metadata?: unknown;
  now?: Date;
  minAgeMs: number;
}): SyncDueReason | null {
  const now = input.now ?? new Date();
  const last = input.lastSyncAt ? Date.parse(input.lastSyncAt) : NaN;
  if (!Number.isFinite(last)) return "never";
  if (now.getTime() - last >= input.minAgeMs) return "age";
  const rec =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : {};
  const state =
    rec.liveAccountState && typeof rec.liveAccountState === "object" && !Array.isArray(rec.liveAccountState)
      ? (rec.liveAccountState as Record<string, unknown>)
      : null;
  const anchorDay = typeof state?.dayStartDate === "string" ? state.dayStartDate : "";
  if (anchorDay !== liveAccountDayKey(rec, now)) return "day_roll";
  return null;
}
