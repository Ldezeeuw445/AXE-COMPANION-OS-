"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_ACTIVE_SESSION,
  LEGACY_SYMBOL_KEY,
  LEGACY_TF_KEY,
  SESSION_STORAGE_KEY,
  formatSessionCookie,
  mergeActiveSession,
  parseActiveSession,
  sanitizeActiveSession,
  serializeActiveSession,
  type ActiveSessionState,
} from "@/lib/session/activeSession";

type Listener = () => void;

const listeners = new Set<Listener>();

let state: ActiveSessionState = DEFAULT_ACTIVE_SESSION;
let serverSnapshot: ActiveSessionState = DEFAULT_ACTIVE_SESSION;
let hydrated = false;

function emit() {
  for (const listener of listeners) listener();
}

function writeBrowserPersistence(next: ActiveSessionState) {
  if (typeof document === "undefined") return;
  try {
    document.cookie = formatSessionCookie(next);
  } catch {
    /* cookie may be blocked */
  }
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, serializeActiveSession(next));
    window.localStorage.setItem(LEGACY_SYMBOL_KEY, next.symbol);
    window.localStorage.setItem(LEGACY_TF_KEY, next.timeframe);
  } catch {
    /* storage may be blocked */
  }
}

function readLegacyFromStorage(): Partial<ActiveSessionState> {
  if (typeof window === "undefined") return {};
  try {
    return {
      symbol: window.localStorage.getItem(LEGACY_SYMBOL_KEY) ?? undefined,
      timeframe: window.localStorage.getItem(LEGACY_TF_KEY) ?? undefined,
    };
  } catch {
    return {};
  }
}

function readStoredSession(): ActiveSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    const parsed = parseActiveSession(raw);
    if (parsed) return parsed;
  } catch {
    /* ignore */
  }
  const legacy = readLegacyFromStorage();
  if (legacy.symbol || legacy.timeframe) {
    return sanitizeActiveSession(legacy);
  }
  return null;
}

/**
 * Single hydration path: apply the server cookie snapshot during render
 * (no emit — subscribers must not setState while React is rendering).
 */
export function prepareActiveSession(snapshot: ActiveSessionState): ActiveSessionState {
  const next = sanitizeActiveSession(snapshot);
  serverSnapshot = next;
  if (!hydrated) {
    state = next;
    hydrated = true;
  }
  return state;
}

export function hydrateActiveSession(snapshot: ActiveSessionState): ActiveSessionState {
  const next = prepareActiveSession(snapshot);
  writeBrowserPersistence(state);
  emit();
  return next;
}

export function persistActiveSession(): void {
  writeBrowserPersistence(state);
}

export function ensureActiveSessionHydrated(snapshot?: ActiveSessionState): ActiveSessionState {
  if (hydrated) return state;
  if (snapshot) return hydrateActiveSession(snapshot);
  const stored = readStoredSession();
  return hydrateActiveSession(stored ?? DEFAULT_ACTIVE_SESSION);
}

export function getActiveSession(): ActiveSessionState {
  return state;
}

export function getActiveSessionServerSnapshot(): ActiveSessionState {
  return serverSnapshot;
}

export function patchActiveSession(patch: Partial<ActiveSessionState>): ActiveSessionState {
  const next = mergeActiveSession(state, patch);
  const changed =
    next.userId !== state.userId ||
    next.accountId !== state.accountId ||
    next.accountType !== state.accountType ||
    next.accountLabel !== state.accountLabel ||
    next.symbol !== state.symbol ||
    next.timeframe !== state.timeframe ||
    next.lastTab !== state.lastTab;
  if (!changed) return state;
  state = next;
  if (!hydrated) {
    serverSnapshot = next;
    hydrated = true;
  }
  writeBrowserPersistence(state);
  emit();
  return state;
}

export function subscribeActiveSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActiveSession(): ActiveSessionState {
  return useSyncExternalStore(
    subscribeActiveSession,
    getActiveSession,
    getActiveSessionServerSnapshot,
  );
}

export function usePatchActiveSession(): (patch: Partial<ActiveSessionState>) => ActiveSessionState {
  return useCallback((patch: Partial<ActiveSessionState>) => patchActiveSession(patch), []);
}

/** Test-only reset so unit cases do not leak store state. */
export function resetActiveSessionForTests(next: ActiveSessionState = DEFAULT_ACTIVE_SESSION): void {
  state = sanitizeActiveSession(next);
  serverSnapshot = state;
  hydrated = false;
  listeners.clear();
}
