import { SQUAWK_STATIONS, type SquawkStation } from "@/lib/squawk/streams";

export const SQUAWK_STATION_IDS = SQUAWK_STATIONS.map((s) => s.id);
const STORAGE_KEY = "axe.squawk.stationIds";

export function resolveSquawkStations(ids: string[] | null | undefined): SquawkStation[] {
  if (!ids?.length) return SQUAWK_STATIONS;
  const allowed = new Set(ids);
  const filtered = SQUAWK_STATIONS.filter((s) => allowed.has(s.id));
  return filtered.length > 0 ? filtered : SQUAWK_STATIONS;
}

export function readSquawkStationIds(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return null;
  }
}

export function writeSquawkStationIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent("axe:squawk-stations-changed"));
  } catch {
    /* ignore */
  }
}

export function normalizeSquawkStationIds(ids: string[] | null | undefined): string[] {
  if (!ids?.length) return [...SQUAWK_STATION_IDS];
  const allowed = new Set(SQUAWK_STATION_IDS);
  const filtered = ids.filter((id) => allowed.has(id));
  return filtered.length > 0 ? filtered : [...SQUAWK_STATION_IDS];
}
