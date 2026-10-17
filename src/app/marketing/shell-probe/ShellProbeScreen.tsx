"use client";

import Link from "next/link";
import { ActiveSessionChip } from "@/components/session/ActiveSessionChip";
import { ActiveSessionSeed } from "@/components/session/ActiveSessionSeed";
import { useActiveSession, usePatchActiveSession } from "@/lib/session/activeSessionStore";
import type { ShellTab } from "@/lib/session/activeSession";

export function ShellProbeScreen({ tab }: { tab: Extract<ShellTab, "home" | "markets"> }) {
  const session = useActiveSession();
  const patch = usePatchActiveSession();
  const otherHref = tab === "home" ? "/marketing/shell-probe/markets" : "/marketing/shell-probe";
  const otherLabel = tab === "home" ? "Markets" : "Home";

  return (
    <div data-testid="shell-probe" data-shell-probe-tab={tab} className="flex flex-col gap-4 px-1 py-4">
      <ActiveSessionSeed lastTab={tab} />
      <h1 className="text-lg font-semibold text-white">{tab === "home" ? "Home" : "Markets"}</h1>
      <p className="text-sm text-white/55">
        QA probe for the shared mobile shell. Same top bar, same bottom tabs, same session.
      </p>
      <ActiveSessionChip />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="shell-probe-set-session"
          className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[12px] text-cyan-100"
          onClick={() =>
            patch({
              symbol: "EURUSD",
              timeframe: "m15",
              accountId: "probe-acct",
              accountLabel: "Probe Live",
              accountType: "live",
              lastTab: tab,
            })
          }
        >
          Set EURUSD M15 live
        </button>
        <Link
          href={otherHref}
          data-testid="shell-probe-other-tab"
          className="rounded-lg border border-white/10 px-3 py-2 text-[12px] text-white/80"
        >
          Open {otherLabel}
        </Link>
      </div>
      <p data-testid="shell-probe-session-json" className="font-mono text-[11px] text-white/40">
        {JSON.stringify({
          symbol: session.symbol,
          timeframe: session.timeframe,
          lastTab: session.lastTab,
          accountType: session.accountType,
        })}
      </p>
    </div>
  );
}
