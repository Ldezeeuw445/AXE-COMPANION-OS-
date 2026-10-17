"use client";

import { CHART_TF_OPTIONS } from "@/lib/broker/chartTimeframes";
import { useActiveSession } from "@/lib/session/activeSessionStore";

const TYPE_LABEL: Record<string, string> = {
  live: "Live",
  demo: "Demo",
  prop: "Prop",
  funded: "Funded",
  unknown: "Account",
};

/** Compact readout so Home (and probes) show the same session as other tabs. */
export function ActiveSessionChip() {
  const session = useActiveSession();
  const tfLabel = CHART_TF_OPTIONS.find((option) => option.key === session.timeframe)?.label ?? session.timeframe;
  const account = session.accountLabel ?? TYPE_LABEL[session.accountType] ?? "Account";

  return (
    <div
      data-testid="active-session-chip"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px] text-white/70"
    >
      <span className="font-mono text-[11px] tracking-wider text-[#00d4f5]">{session.symbol}</span>
      <span className="font-mono text-white/45">{tfLabel}</span>
      <span className="text-white/25">·</span>
      <span className="truncate">{account}</span>
      {session.accountType !== "unknown" ? (
        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">
          {TYPE_LABEL[session.accountType]}
        </span>
      ) : null}
    </div>
  );
}
