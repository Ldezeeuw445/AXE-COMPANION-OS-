/**
 * INTEL-FREE — per-source fallback for the intel snapshot.
 *
 * Before this, one failing source (e.g. FMP key missing, FINRA CDN down) made
 * `fetchIntelSnapshot` discard the whole fresh snapshot and serve the previous
 * cached one for up to 24h, so every healthy feed froze too. Here only the
 * failed section borrows its last-known rows from cache; its provider badge
 * stays "error" (UI: unavailable) with a reason that says the rows are cached.
 *
 * Pure and structural (no imports) so Node tests load it via type stripping.
 */

/** Provider id → snapshot field that holds its rows. */
export const INTEL_SECTION_BY_PROVIDER = {
  insiderTrades: "insiders",
  senateTrades: "senate",
  shortVolume: "shortVolume",
  darkPoolPrints: "darkPool",
  unusualOptions: "options",
  marketTide: "tide",
  corporateJets: "jets",
  vesselTracking: "vessels",
  chokepoints: "chokepoints",
  conflictEvents: "conflicts",
  energyFlows: "energy",
  cyberThreats: "cyber",
  militaryRadar: "military",
  // emergencyMonitor deliberately absent: replaying old squawks as current is misleading.
} as const;

export type IntelSectionKey =
  (typeof INTEL_SECTION_BY_PROVIDER)[keyof typeof INTEL_SECTION_BY_PROVIDER];

type ProviderLike = {
  id: string;
  state: "live" | "off" | "error";
  description?: string;
  reason?: string;
};

type SnapshotLike = { providers: ProviderLike[] } & Record<string, unknown>;

export type SectionCacheEntry<S extends SnapshotLike> = {
  snapshot: S;
  savedAt: number;
  /** When each section's rows were last fetched live; defaults to savedAt. */
  sectionSavedAt?: Partial<Record<IntelSectionKey, number>>;
};

export function sectionHasRows(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value != null;
}

export function formatCachedAge(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

/**
 * Fill failed, empty sections of `fresh` from `cached` (if younger than
 * `maxAgeMs`). Healthy sections are never touched. Returns per-section
 * timestamps so carried rows keep their original age on the next cache write
 * instead of being laundered into "fresh".
 */
export function mergeFailedSectionsFromCache<S extends SnapshotLike>(args: {
  fresh: S;
  cached?: SectionCacheEntry<S>;
  now: number;
  maxAgeMs: number;
}): {
  snapshot: S;
  carried: IntelSectionKey[];
  sectionSavedAt: Partial<Record<IntelSectionKey, number>>;
} {
  const { fresh, cached, now, maxAgeMs } = args;
  const sectionSavedAt: Partial<Record<IntelSectionKey, number>> = {};
  const carried: IntelSectionKey[] = [];
  const out = { ...fresh } as Record<string, unknown>;
  const providers = fresh.providers.map((p) => ({ ...p }));

  for (const p of providers) {
    const key = (INTEL_SECTION_BY_PROVIDER as Record<string, IntelSectionKey>)[p.id];
    if (!key) continue;
    if (sectionHasRows(fresh[key])) {
      sectionSavedAt[key] = now;
      continue;
    }
    if (p.state !== "error" || !cached) continue;
    const rows = cached.snapshot[key];
    if (!sectionHasRows(rows)) continue;
    const at = cached.sectionSavedAt?.[key] ?? cached.savedAt;
    if (now - at >= maxAgeMs) continue;

    out[key] = rows;
    sectionSavedAt[key] = at;
    carried.push(key);
    const cachedNote = `cached ${formatCachedAge(now - at)}`;
    p.reason = p.reason ? `${cachedNote} · ${p.reason}` : cachedNote;
    p.description = p.description
      ? `${p.description} (showing ${cachedNote} rows)`
      : `showing ${cachedNote} rows`;
  }

  out.providers = providers;
  return { snapshot: out as S, carried, sectionSavedAt };
}
