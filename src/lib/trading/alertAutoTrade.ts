/**
 * May this alert place an order, and if not — which switch is off?
 *
 * Four separate gates stood between a price alert and a live order, each
 * checked in a different place and each returning its own silence:
 *
 *   1. `alert_auto_trade_enabled` — the trader's preference, read in
 *      `alertAutoTradeService` and returning a bare `{ traded: false }`.
 *   2. the per-alert opt-in in `user_alerts.metadata`.
 *   3. the 30-minute arm window.
 *   4. the autonomy level, weighed much later in `tradeGuardService`.
 *
 * They are ANDed, so nothing unsafe came of it. What came of it was build-list
 * item L19.8: a trader can set autonomy to level 3, fill in three limits, tick
 * three acknowledgements — and nothing happens, because gate 1 is off in a
 * different screen. Or the reverse: switch on alert auto-trade, believe they
 * are done, and be stopped by the guard. Two switches for one decision, and
 * neither screen mentions the other.
 *
 * This does not add a fifth gate and does not loosen any of the four. It asks
 * them in one place, in the order a trader needs to hear them, and names the
 * one that is actually in the way. The autonomy level comes first because it
 * is the real decision — the rest are scopes on a permission that has to exist
 * first.
 *
 * Returns the blocker rather than a boolean, for the same reason
 * `resolveAutonomy` returns what is missing and `provenanceBlocks` returns
 * why: "no" without a reason teaches a trader to stop trusting the feature,
 * and they have no way to find out which of four screens to open.
 *
 * Dependency-free apart from `autonomy.ts`, which imports nothing, so the
 * verify suite can exercise this directly.
 */

import { autonomyAllows, type AutonomySettings } from "@/lib/trading/autonomy";

/** Which of the four gates stopped it. */
export type AlertTradeBlocker =
  /** AXE is not allowed to place orders unattended at all. */
  | "autonomy_level"
  /** Allowed to place, but price alerts are not one of the ways. */
  | "channel_off"
  /** This one alert is opted out, while others may trade. */
  | "alert_off"
  /** Allowed, but the arm window has expired. */
  | "not_armed";

export type AlertTradeGate =
  | { ready: true }
  | {
      ready: false;
      blocker: AlertTradeBlocker;
      /** One sentence the trader reads, naming the switch and where it lives. */
      detail: string;
      /** Where to go. Null when the blocker is not something a screen fixes. */
      href: string | null;
    };

export type AlertTradeInputs = {
  autonomy: AutonomySettings;
  /** The account-wide preference: may price alerts trade at all. */
  channelEnabled: boolean;
  /** This alert's own opt-in, already read from its metadata. */
  alertEnabled: boolean;
  /** Whether the 30-minute arm window is still open. */
  armed: boolean;
};

/**
 * The four gates, in the order a trader needs to hear about them.
 *
 * Order is not cosmetic. A trader whose autonomy level is 1 does not need to
 * be told to tap Arm — arming would change nothing, and telling them to do it
 * sends them to the wrong screen. So the most fundamental gate reports first,
 * and each later one only speaks when everything above it is already open.
 */
export function evaluateAlertTradeGate(input: AlertTradeInputs): AlertTradeGate {
  const autonomy = autonomyAllows("place", input.autonomy);
  if (!autonomy.allowed) {
    return {
      ready: false,
      blocker: "autonomy_level",
      detail: autonomy.detail,
      href: "/settings",
    };
  }

  if (!input.channelEnabled) {
    return {
      ready: false,
      blocker: "channel_off",
      detail:
        "AXE may place orders on its own, but not from price alerts — that is a separate switch under Trade execution in Settings.",
      href: "/settings",
    };
  }

  if (!input.alertEnabled) {
    return {
      ready: false,
      blocker: "alert_off",
      detail: "Auto-trade is switched off for this alert. Your other alerts are unaffected.",
      href: "/alerts",
    };
  }

  if (!input.armed) {
    return {
      ready: false,
      blocker: "not_armed",
      detail: "Auto-trade is not armed — tap Arm on Alerts before the next fire.",
      href: "/alerts",
    };
  }

  return { ready: true };
}

/**
 * What still has to happen before this alert could trade, for a settings
 * screen to show next to the switch the trader is looking at.
 *
 * The gate above answers "can it, right now". This answers "what is in the
 * way", which is the question someone has while configuring rather than while
 * an alert fires. `not_armed` is deliberately absent: arming is a thing you do
 * in the thirty minutes before you want it, not a setting left undone, and
 * listing it here would make a correctly configured account look broken.
 */
export function alertTradeSetupGaps(input: Omit<AlertTradeInputs, "armed">): string[] {
  const gate = evaluateAlertTradeGate({ ...input, armed: true });
  if (gate.ready) return [];
  return [gate.detail];
}
