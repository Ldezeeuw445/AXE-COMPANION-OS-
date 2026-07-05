"use client";

import { useEffect, useMemo, useState } from "react";
import type { AccountRiskBandSnapshot } from "@/lib/risk/accountRiskBand";
import { formatRiskDollars, formatRiskPercent } from "@/lib/risk/accountRiskBand";
import { cn } from "@/lib/utils";

type DemoPositionPayload = {
  id: string;
  symbol: string;
  side: string;
  volume: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  livePrice?: number | null;
};

type OpenPositionPayload = DemoPositionPayload & {
  profit?: number | null;
};

type PendingOrderPayload = {
  id: string;
  symbol: string;
  side: string;
  volume: number;
  openPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
};

type Props = {
  openPositions?: OpenPositionPayload[];
  demoPositions?: DemoPositionPayload[];
  pendingOrders?: PendingOrderPayload[];
  compact?: boolean;
  className?: string;
};

/** Live open-book risk: SL/TP scenarios + % of equity at risk. */
export function AccountRiskBand({ openPositions = [], demoPositions = [], pendingOrders = [], compact = false, className }: Props) {
  const [band, setBand] = useState<AccountRiskBandSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const payloadKey = useMemo(
    () => JSON.stringify({ openPositions, demoPositions, pendingOrders }),
    [openPositions, demoPositions, pendingOrders],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/risk/band", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ openPositions, demoPositions, pendingOrders }),
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { band?: AccountRiskBandSnapshot };
        if (!cancelled) setBand(json.band ?? null);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payloadKey, openPositions, demoPositions, pendingOrders]);

  if (loading && !band) {
    return (
      <div className={cn("rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 text-[10px] text-tos-dim", className)}>
        Risk band…
      </div>
    );
  }

  if (!band || band.positionCount === 0) {
    return (
      <div className={cn("rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 text-[10px] text-tos-dim", className)}>
        No open or pending trades — risk band idle
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-black/50 px-3 py-2 backdrop-blur-sm",
        band.overMaxRisk ? "border-tos-risk/40" : "border-white/[0.08]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">Risk</span>
        <Metric label="Open P&L" value={formatRiskPercent(band.openPnlPercent, true)} tone={band.openPnlPercent >= 0 ? "up" : "down"} />
        <Metric label="All SL" value={formatRiskPercent(band.slScenarioPercent, true)} tone={band.overMaxRisk ? "risk" : "down"} />
        <Metric label="All TP" value={formatRiskPercent(band.tpScenarioPercent, true)} tone="up" />
      </div>
      {!compact ? (
        <p className="mt-1.5 text-[10px] leading-snug text-tos-muted">
          {band.withStopCount}/{band.positionCount} with SL · worst {formatRiskDollars(band.totalLossIfAllSl)} · best{" "}
          {formatRiskDollars(band.totalProfitIfAllTp)}
          {band.withoutStopCount > 0 ? ` · ${band.withoutStopCount} unprotected` : ""}
        </p>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "risk" | "up" | "down";
}) {
  const color =
    tone === "risk"
      ? "text-tos-risk"
      : tone === "up"
        ? "text-emerald-400"
        : tone === "down"
          ? "text-tos-short"
          : "text-cyan-300";
  return (
    <span className="text-[10px] text-white/45">
      {label}{" "}
      <span className={cn("font-semibold tabular-nums", color)}>{value}</span>
    </span>
  );
}
