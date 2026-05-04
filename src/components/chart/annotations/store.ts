"use client";

import type { ChartAnnotation } from "./types";

const KEY_PREFIX = "axe.chart.annotations";

function storageKey(symbol: string, timeframe: string): string {
  return `${KEY_PREFIX}.${symbol.toUpperCase()}.${timeframe.toLowerCase()}`;
}

/** Read annotations from localStorage; returns [] when nothing/invalid. */
export function loadAnnotations(symbol: string, timeframe: string): ChartAnnotation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(symbol, timeframe));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAnnotation);
  } catch {
    return [];
  }
}

export function saveAnnotations(
  symbol: string,
  timeframe: string,
  annotations: ChartAnnotation[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(symbol, timeframe), JSON.stringify(annotations));
  } catch {
    /* storage full / blocked — silently ignore */
  }
}

export function appendAnnotation(
  symbol: string,
  timeframe: string,
  next: ChartAnnotation,
): ChartAnnotation[] {
  const list = loadAnnotations(symbol, timeframe);
  const updated = [...list, next];
  saveAnnotations(symbol, timeframe, updated);
  return updated;
}

export function removeAnnotation(
  symbol: string,
  timeframe: string,
  id: string,
): ChartAnnotation[] {
  const list = loadAnnotations(symbol, timeframe).filter((a) => a.id !== id);
  saveAnnotations(symbol, timeframe, list);
  return list;
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
