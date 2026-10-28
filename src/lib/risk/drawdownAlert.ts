import type { LossBasis, TradingConstraints } from "@/lib/risk/accountProfile";
import type { ProactiveNotice } from "@/lib/axe/notice";
import { signedAmount } from "@/lib/axe/notice";

export const DRAWDOWN_WARN_PCTS = [70, 85, 95] as const;
export type DrawdownWarnPct = (typeof DRAWDOWN_WARN_PCTS)[number];
export type DrawdownKind = "daily" | "total";

export type LiveEquitySnapshot = {
  equity: number;
  balance: number;
  /** Balance at the UTC day open. Falls back to balance when unknown. */
  dayStartBalance: number | null;
  dayStartEquity: number | null;
  /** Starting capital the total-loss rule is measured from. */
  initialBalance: number | null;
  peakBalance: number | null;
};

export type DrawdownReading = {
  kind: DrawdownKind;
  usedPct: number;
  ofLimitPct: number;
  limitPct: number;
  basis: LossBasis;
  loss: number;
  reference: number;
};

export type DrawdownAlert = {
  kind: DrawdownKind;
  band: DrawdownWarnPct;
  reading: DrawdownReading;
  eventKey: string;
  notice: ProactiveNotice;
};

function referenceFor(basis: LossBasis, snap: LiveEquitySnapshot): number | null {
  switch (basis) {
    case "initial_balance":
      return positive(snap.initialBalance ?? snap.dayStartBalance ?? snap.balance);
    case "day_start_balance":
      return positive(snap.dayStartBalance ?? snap.balance);
    case "day_start_equity":
      return positive(snap.dayStartEquity ?? snap.equity);
    case "trailing_eod_balance":
    case "trailing_peak_balance":
      return positive(snap.peakBalance ?? snap.balance);
    default:
      return positive(snap.balance);
  }
}

function positive(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function readingForKind(
  kind: DrawdownKind,
  constraints: Pick<TradingConstraints, "maxDailyLossPct" | "maxDailyLossBasis" | "maxTotalLossPct" | "maxTotalLossBasis">,
  snap: LiveEquitySnapshot,
): DrawdownReading | null {
  const limitPct = kind === "daily" ? constraints.maxDailyLossPct : constraints.maxTotalLossPct;
  const basis = kind === "daily" ? constraints.maxDailyLossBasis : constraints.maxTotalLossBasis;
  if (limitPct == null || limitPct <= 0 || !basis) return null;
  const reference = referenceFor(basis, snap);
  if (reference == null) return null;
  const loss = reference - snap.equity;
  if (!Number.isFinite(loss)) return null;
  const usedPct = (loss / reference) * 100;
  if (usedPct < 0) return null;
  return {
    kind,
    usedPct,
    ofLimitPct: (usedPct / limitPct) * 100,
    limitPct,
    basis,
    loss,
    reference,
  };
}

export function bandForUtilization(ofLimitPct: number): DrawdownWarnPct | null {
  if (ofLimitPct >= 95) return 95;
  if (ofLimitPct >= 85) return 85;
  if (ofLimitPct >= 70) return 70;
  return null;
}

export function drawdownEventKey(
  accountId: string,
  kind: DrawdownKind,
  band: DrawdownWarnPct,
  dayStamp: string,
): string {
  return `drawdown:${accountId}:${kind}:${band}:${dayStamp}`;
}

function kindLabel(kind: DrawdownKind): string {
  return kind === "daily" ? "daily loss" : "total drawdown";
}

export function buildDrawdownNotice(reading: DrawdownReading, band: DrawdownWarnPct): ProactiveNotice {
  const used = reading.usedPct.toFixed(1);
  const ofLimit = reading.ofLimitPct.toFixed(0);
  const limit = reading.limitPct.toFixed(1);
  const remaining = Math.max(0, 100 - reading.ofLimitPct).toFixed(0);
  return {
    title: `${band}% of ${kindLabel(reading.kind)} limit`,
    what: `${used}% of equity is gone (${signedAmount(-reading.loss)}) — ${ofLimit}% of the ${limit}% ${kindLabel(reading.kind)} cap.`,
    soWhat:
      band >= 95
        ? `One more push ends the ${reading.kind === "daily" ? "day" : "account"}. ${remaining}% of the limit is left.`
        : `The firm's ${kindLabel(reading.kind)} rule is ${limit}%. You are in the ${band}% warning zone.`,
    action: { label: "Open positions and cut or hedge", href: "/positions" },
  };
}

/**
 * Highest crossed band per kind. Dedup is the caller's job via event_key.
 * Returns at most two alerts (daily + total) for the current snapshot.
 */
export function evaluateDrawdownAlerts(input: {
  accountId: string;
  constraints: Pick<TradingConstraints, "maxDailyLossPct" | "maxDailyLossBasis" | "maxTotalLossPct" | "maxTotalLossBasis">;
  snap: LiveEquitySnapshot;
  now?: Date;
}): DrawdownAlert[] {
  const now = input.now ?? new Date();
  const dayStamp = now.toISOString().slice(0, 10);
  const alerts: DrawdownAlert[] = [];
  for (const kind of ["daily", "total"] as const) {
    const reading = readingForKind(kind, input.constraints, input.snap);
    if (!reading) continue;
    const band = bandForUtilization(reading.ofLimitPct);
    if (!band) continue;
    alerts.push({
      kind,
      band,
      reading,
      eventKey: drawdownEventKey(input.accountId, kind, band, dayStamp),
      notice: buildDrawdownNotice(reading, band),
    });
  }
  return alerts;
}
