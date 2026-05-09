"use client";

/**
 * Per-device "live trading" arming flag.
 *
 * Why client-side only:
 *   - This flag is purely a UX guardrail to prevent accidental BUY/SELL.
 *   - Real safety is enforced by the server route (/api/mt5/order):
 *     it refuses orders for demo accounts, requires Supabase auth, and
 *     verifies the broker account belongs to the user.
 *   - Persisting per-device means the user has to re-acknowledge risk on
 *     every new device — a feature, not a bug.
 */
import { useCallback, useEffect, useState } from "react";

const ENABLED_KEY = "axe.live_trading.enabled.v1";
const ARMED_UNTIL_KEY = "axe.live_trading.armed_until.v1";

/** How long an arming session lasts before the user must re-arm. */
export const ARM_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export const REQUIRED_PHRASE = "I am responsible";

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

function readArmedUntil(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(ARMED_UNTIL_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeEnabled(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(ENABLED_KEY, "true");
    else window.localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* quota — silently ignore */
  }
}

function writeArmedUntil(value: number): void {
  if (typeof window === "undefined") return;
  try {
    if (value > Date.now()) window.localStorage.setItem(ARMED_UNTIL_KEY, String(value));
    else window.localStorage.removeItem(ARMED_UNTIL_KEY);
  } catch {
    /* quota — silently ignore */
  }
}

export type LiveTradingState = {
  /** Master enable: does this device acknowledge risk + opt into live trading? */
  enabled: boolean;
  /** Within an arming window: BUY/SELL still requires final confirm. */
  armed: boolean;
  /** Epoch ms when the current arm expires, or 0. */
  armedUntilMs: number;
};

export function useLiveTradingFlag(): LiveTradingState & {
  enable: () => void;
  disable: () => void;
  arm: () => void;
  disarm: () => void;
} {
  const [state, setState] = useState<LiveTradingState>(() => deriveState());
  const refresh = useCallback(() => setState(deriveState()), []);

  // Tick once a minute so the armed window auto-expires in the UI.
  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === ENABLED_KEY || event.key === ARMED_UNTIL_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const enable = useCallback(() => {
    writeEnabled(true);
    refresh();
  }, [refresh]);

  const disable = useCallback(() => {
    writeEnabled(false);
    writeArmedUntil(0);
    refresh();
  }, [refresh]);

  const arm = useCallback(() => {
    if (!readEnabled()) return;
    writeArmedUntil(Date.now() + ARM_WINDOW_MS);
    refresh();
  }, [refresh]);

  const disarm = useCallback(() => {
    writeArmedUntil(0);
    refresh();
  }, [refresh]);

  return { ...state, enable, disable, arm, disarm };
}

function deriveState(): LiveTradingState {
  const enabled = readEnabled();
  const armedUntil = readArmedUntil();
  const armed = enabled && armedUntil > Date.now();
  return { enabled, armed, armedUntilMs: armedUntil };
}
