"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";

type CockpitEngineStatusProps = {
  engine: {
    name: string;
    version: string;
    confidenceScore: number;
    confidenceTier: "low" | "medium" | "high";
    gateMode: "strict" | "guided" | "proactive";
    signalCount: number;
    tradeLabelCount: number;
    memoryCount: number;
    updatedAt: string | null;
  };
};

function tierTone(tier: "low" | "medium" | "high"): string {
  if (tier === "high") return "text-emerald-300";
  if (tier === "medium") return "text-cyan-300";
  return "text-amber-300";
}

export function CockpitEngineStatus({ engine }: CockpitEngineStatusProps) {
  return (
    <GlassPanel className="p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
        AXE Engine
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-tos-muted">
        {engine.name} {engine.version} · confidence{" "}
        <span className={`font-semibold ${tierTone(engine.confidenceTier)}`}>
          {engine.confidenceScore}/100
        </span>{" "}
        · gate <span className="font-semibold text-tos-text">{engine.gateMode}</span>
      </p>
      <p className="mt-1 text-[11px] text-tos-dim">
        Signals: {engine.signalCount} · Trade labels: {engine.tradeLabelCount} · Memory: {engine.memoryCount}
      </p>
      <p className="mt-1 text-[11px] text-tos-dim">
        Last engine refresh: {engine.updatedAt ? new Date(engine.updatedAt).toLocaleString() : "not yet"}
      </p>
    </GlassPanel>
  );
}
