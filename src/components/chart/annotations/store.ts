"use client";

import type { ChartAnnotation, ChartAnnotationType } from "./types";
import {
  applyLocalSave,
  coerceDrawingIds,
  groupByStorageKey,
  mergeDrawingsLastWriteWins,
  parseStorageKeySuffix,
  visibleForChart,
  type SyncedDrawing,
} from "@/lib/chart/drawingsSync";

const KEY_PREFIX = "axe.chart.annotations";
const MIGRATE_KEY = "axe.chart.drawings.local-migrated";
const PUSH_DEBOUNCE_MS = 400;

function storageKey(symbol: string, timeframe: string): string {
  return `${KEY_PREFIX}.${symbol.toUpperCase()}.${timeframe.toLowerCase()}`;
}

function annotationToSynced(annotation: ChartAnnotation, deleted = false): SyncedDrawing {
  const rest: Record<string, unknown> = { ...annotation };
  delete rest.deleted;
  return {
    id: annotation.id,
    symbol: annotation.symbol,
    timeframe: annotation.timeframe || null,
    toolType: annotation.type,
    drawing: rest,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
    deleted: deleted || Boolean(annotation.deleted),
  };
}

function syncedToAnnotation(row: SyncedDrawing): ChartAnnotation {
  const drawing = row.drawing;
  const points = Array.isArray(drawing.points) ? (drawing.points as ChartAnnotation["points"]) : [];
  const type = (typeof drawing.type === "string" ? drawing.type : row.toolType) as ChartAnnotationType;
  return {
    id: row.id,
    userId: typeof drawing.userId === "string" ? drawing.userId : drawing.userId === null ? null : undefined,
    accountId:
      typeof drawing.accountId === "string" ? drawing.accountId : drawing.accountId === null ? null : undefined,
    symbol: row.symbol,
    timeframe: row.timeframe ?? (typeof drawing.timeframe === "string" ? drawing.timeframe : ""),
    type,
    points,
    settings:
      drawing.settings && typeof drawing.settings === "object"
        ? (drawing.settings as Record<string, unknown>)
        : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deleted: row.deleted,
  };
}

function isAnnotation(v: unknown): v is ChartAnnotation {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.symbol === "string" &&
    typeof o.timeframe === "string" &&
    typeof o.type === "string" &&
    Array.isArray(o.points) &&
    o.points.length >= 1 &&
    o.points.every((p) => {
      if (!p || typeof p !== "object") return false;
      const pp = p as Record<string, unknown>;
      return typeof pp.time === "number" && typeof pp.price === "number";
    })
  );
}

function readRaw(symbol: string, timeframe: string): SyncedDrawing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(symbol, timeframe));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAnnotation).map((a) => annotationToSynced(a, Boolean(a.deleted)));
  } catch {
    return [];
  }
}

function writeRaw(symbol: string, timeframe: string, drawings: SyncedDrawing[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload = drawings.map((row) => syncedToAnnotation(row));
    window.localStorage.setItem(storageKey(symbol, timeframe), JSON.stringify(payload));
  } catch {
    /* storage full / blocked — silently ignore */
  }
}

function loadAllLocalSynced(): SyncedDrawing[] {
  if (typeof window === "undefined") return [];
  const out: SyncedDrawing[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(`${KEY_PREFIX}.`)) continue;
    const suffix = key.slice(KEY_PREFIX.length + 1);
    const parsed = parseStorageKeySuffix(suffix);
    if (!parsed) continue;
    out.push(...readRaw(parsed.symbol, parsed.timeframe));
  }
  return out;
}

function writeSyncedGroups(drawings: SyncedDrawing[]): void {
  for (const [groupKey, rows] of groupByStorageKey(drawings)) {
    const lastDot = groupKey.lastIndexOf(".");
    const symbol = groupKey.slice(0, lastDot);
    const timeframe = groupKey.slice(lastDot + 1);
    writeRaw(symbol, timeframe, rows);
  }
}

function toVisibleList(drawings: SyncedDrawing[], symbol: string, timeframe: string): ChartAnnotation[] {
  return visibleForChart(drawings, symbol, timeframe).map((row) => {
    const annotation = syncedToAnnotation(row);
    delete annotation.deleted;
    return annotation;
  });
}

/** Read annotations from localStorage; returns [] when nothing/invalid. Omits tombstones. */
export function loadAnnotations(symbol: string, timeframe: string): ChartAnnotation[] {
  return toVisibleList(readRaw(symbol, timeframe), symbol, timeframe);
}

export function saveAnnotations(
  symbol: string,
  timeframe: string,
  annotations: ChartAnnotation[],
): void {
  if (typeof window === "undefined") return;
  const previous = readRaw(symbol, timeframe);
  const nextVisible = annotations.map((a) => annotationToSynced(a, false));
  const merged = applyLocalSave(previous, nextVisible, new Date().toISOString());
  const coerced = coerceDrawingIds(merged);
  writeRaw(symbol, timeframe, coerced.drawings);
  queuePush(coerced.drawings);
}

export function appendAnnotation(
  symbol: string,
  timeframe: string,
  next: ChartAnnotation,
): ChartAnnotation[] {
  const list = loadAnnotations(symbol, timeframe);
  const updated = [...list, next];
  saveAnnotations(symbol, timeframe, updated);
  return loadAnnotations(symbol, timeframe);
}

export function removeAnnotation(
  symbol: string,
  timeframe: string,
  id: string,
): ChartAnnotation[] {
  const list = loadAnnotations(symbol, timeframe).filter((a) => a.id !== id);
  saveAnnotations(symbol, timeframe, list);
  return loadAnnotations(symbol, timeframe);
}

type FetchResult =
  | { status: "ok"; drawings: SyncedDrawing[] }
  | { status: "unsigned" }
  | { status: "error" };

function parseRemoteDrawings(payload: unknown): SyncedDrawing[] {
  if (!payload || typeof payload !== "object") return [];
  const drawings = (payload as { drawings?: unknown }).drawings;
  if (!Array.isArray(drawings)) return [];
  const out: SyncedDrawing[] = [];
  for (const item of drawings) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string") continue;
    if (typeof row.symbol !== "string") continue;
    if (typeof row.toolType !== "string") continue;
    out.push({
      id: row.id,
      symbol: row.symbol,
      timeframe: typeof row.timeframe === "string" ? row.timeframe : null,
      toolType: row.toolType,
      drawing: row.drawing && typeof row.drawing === "object" ? (row.drawing as Record<string, unknown>) : {},
      createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date(0).toISOString(),
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date(0).toISOString(),
      deleted: row.deleted === true,
    });
  }
  return out;
}

async function fetchDrawings(params?: { symbol?: string; timeframe?: string }): Promise<FetchResult> {
  const url = new URL("/api/chart/drawings", window.location.origin);
  if (params?.symbol) url.searchParams.set("symbol", params.symbol);
  if (params?.timeframe) url.searchParams.set("timeframe", params.timeframe);
  try {
    const res = await fetch(url.toString(), { credentials: "same-origin" });
    if (res.status === 401) return { status: "unsigned" };
    if (!res.ok) return { status: "error" };
    const body: unknown = await res.json();
    return { status: "ok", drawings: parseRemoteDrawings(body) };
  } catch {
    return { status: "error" };
  }
}

const PUT_BATCH = 200;

async function pushDrawings(drawings: SyncedDrawing[]): Promise<boolean> {
  if (drawings.length === 0) return true;
  try {
    for (let i = 0; i < drawings.length; i += PUT_BATCH) {
      const chunk = drawings.slice(i, i + PUT_BATCH);
      const res = await fetch("/api/chart/drawings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drawings: chunk }),
      });
      if (res.status === 401) return true;
      if (!res.ok) return false;
    }
    return true;
  } catch {
    /* offline — local cache remains source of truth until next hydrate */
    return false;
  }
}

const pendingPush = new Map<string, SyncedDrawing>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function queuePush(drawings: SyncedDrawing[]): void {
  if (typeof window === "undefined") return;
  for (const row of drawings) pendingPush.set(row.id, row);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const batch = [...pendingPush.values()];
    pendingPush.clear();
    void pushDrawings(batch);
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Pull remote drawings (when signed in), merge last-write-wins by updatedAt,
 * rewrite localStorage, and push local winners. On first sign-in, migrates
 * every localStorage key once.
 */
export async function hydrateAnnotations(
  symbol: string,
  timeframe: string,
): Promise<ChartAnnotation[]> {
  if (typeof window === "undefined") return [];
  const fallback = loadAnnotations(symbol, timeframe);

  try {
    const alreadyMigrated = window.localStorage.getItem(MIGRATE_KEY) === "1";

    if (!alreadyMigrated) {
      const remote = await fetchDrawings();
      if (remote.status === "unsigned") return fallback;
      if (remote.status !== "ok") return fallback;

      const local = coerceDrawingIds(loadAllLocalSynced());
      if (local.changed) writeSyncedGroups(local.drawings);

      const { merged, toPush } = mergeDrawingsLastWriteWins(local.drawings, remote.drawings);
      writeSyncedGroups(merged);
      const pushed = await pushDrawings(toPush);
      if (pushed) {
        try {
          window.localStorage.setItem(MIGRATE_KEY, "1");
        } catch {
          /* ignore */
        }
      }
      return toVisibleList(merged, symbol, timeframe);
    }

    const remote = await fetchDrawings({ symbol });
    if (remote.status !== "ok") return fallback;

    const localForSymbol = loadAllLocalSynced().filter(
      (row) => row.symbol.toUpperCase() === symbol.toUpperCase(),
    );
    const { merged, toPush } = mergeDrawingsLastWriteWins(localForSymbol, remote.drawings);
    writeSyncedGroups(merged);
    if (toPush.length) void pushDrawings(toPush);
    return toVisibleList(merged, symbol, timeframe);
  } catch {
    return fallback;
  }
}
