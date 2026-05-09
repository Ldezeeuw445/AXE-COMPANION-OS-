"use client";

/**
 * Live-trading flag — split-storage model.
 *
 *   `enabled` is server-side  → user_workspace_preferences.live_trading_enabled.
 *      Survives reinstall, syncs across devices for the same account.
 *   `armed`   is per-device   → localStorage axe.live_trading.armed_until.v1.
 *      Auto-expires after 30 minutes. Each new device starts disarmed even
 *      if the account already has live trading on. The chart still requires
 *      a per-order confirm modal regardless.
 *
 * Real security stays server-side in /api/mt5/order (auth, ownership, demo
 * refusal, MetaApi configured). This hook is the UX guardrail, not the
 * enforcement layer.
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import { toggleLiveTradingEnabledAction } from "@/app/actions/liveTrading";

const ARMED_UNTIL_KEY = "axe.live_trading.armed_until.v1";
// Legacy per-device enable flag — read once on hydration so existing users
// don't lose state, then drop on the next server-side flip.
const LEGACY_ENABLED_KEY = "axe.live_trading.enabled.v1";

/** How long an arming session lasts before the user must re-arm. */
export const ARM_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export const REQUIRED_PHRASE = "I am responsible";

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

function writeArmedUntil(value: number): void {
  if (typeof window === "undefined") return;
  try {
    if (value > Date.now()) window.localStorage.setItem(ARMED_UNTIL_KEY, String(value));
    else window.localStorage.removeItem(ARMED_UNTIL_KEY);
  } catch {
    /* quota — silently ignore */
  }
}

function readLegacyEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LEGACY_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

function clearLegacyEnabled(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_ENABLED_KEY);
  } catch {
    /* ignore */
  }
}

export type LiveTradingState = {
  /** Server-persisted: account-wide acknowledgment of live-trading risk. */
  enabled: boolean;
  /** Per-device window: BUY/SELL ready (still asks per-order confirm). */
  armed: boolean;
  /** Epoch ms when the current arm expires, or 0. */
  armedUntilMs: number;
  /** True while a server-side toggle is in flight. */
  pending: boolean;
};

export function useLiveTradingFlag(initialEnabled: boolean): LiveTradingState & {
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  arm: () => void;
  disarm: () => void;
} {
  // The server prop drives `enabled` — but if the user previously enabled it
  // per-device on this browser (legacy), respect that until the next sync.
  const [enabled, setEnabled] = useState<boolean>(() => initialEnabled);
  const [armedUntilMs, setArmedUntilMs] = useState<number>(0);
  const [pending, startTransition] = useTransition();

  // Hydrate the armed window + legacy carry-over after mount (SSR-safe).
  useEffect(() => {
    setArmedUntilMs(readArmedUntil());
    if (!initialEnabled && readLegacyEnabled()) {
      // Legacy device-only opt-in pre-dates the server flag. Treat it as
      // "enabled" for this session so the user isn't suddenly blocked, and
      // sync to server in the background. This runs at most once.
      setEnabled(true);
      startTransition(async () => {
        const result = await toggleLiveTradingEnabledAction(true);
        if (!result.ok) {
          setEnabled(false);
        } else {
          clearLegacyEnabled();
        }
      });
    } else if (initialEnabled) {
      // Server is now the source of truth — drop any leftover legacy key.
      clearLegacyEnabled();
    }
    // We intentionally only re-sync when the server prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEnabled]);

  // `nowMs` is what makes `armed` reactive — incrementing it in an interval
  // causes the derived `armed` value below to recompute without us having
  // to call Date.now() during render (which trips React 19 purity rules).
  const [nowMs, setNowMs] = useState<number>(() => 0);

  // Tick once a minute so the armed window auto-expires in the UI. We also
  // refresh nowMs so the derived `armed` reflects expiry in real time.
  useEffect(() => {
    setNowMs(Date.now());
    setArmedUntilMs(readArmedUntil());
    const id = setInterval(() => {
      setNowMs(Date.now());
      setArmedUntilMs(readArmedUntil());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Cross-tab sync of the armed window only (enabled is server-driven).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === ARMED_UNTIL_KEY) {
        setArmedUntilMs(readArmedUntil());
        setNowMs(Date.now());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const enable = useCallback(async () => {
    // Optimistic — flip locally so the disclaimer modal feels instant.
    setEnabled(true);
    startTransition(async () => {
      const result = await toggleLiveTradingEnabledAction(true);
      if (!result.ok) setEnabled(false);
    });
  }, []);

  const disable = useCallback(async () => {
    setEnabled(false);
    writeArmedUntil(0);
    setArmedUntilMs(0);
    startTransition(async () => {
      const result = await toggleLiveTradingEnabledAction(false);
      if (!result.ok) setEnabled(true);
    });
  }, []);

  const arm = useCallback(() => {
    if (!enabled) return;
    const next = Date.now() + ARM_WINDOW_MS;
    writeArmedUntil(next);
    setArmedUntilMs(next);
    setNowMs(Date.now());
  }, [enabled]);

  const disarm = useCallback(() => {
    writeArmedUntil(0);
    setArmedUntilMs(0);
  }, []);

  // Derived from state (not Date.now() during render) so React's purity
  // rule stays clean. nowMs ticks every minute via the interval above and
  // refreshes whenever we arm/disarm or storage events fire.
  const armed = enabled && armedUntilMs > nowMs;

  return { enabled, armed, armedUntilMs, pending, enable, disable, arm, disarm };
}
