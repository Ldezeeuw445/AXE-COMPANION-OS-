"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Wrench } from "lucide-react";

export type ReliabilityCheck = {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  actionHref?: string;
  actionLabel?: string;
};

function chipClass(status: ReliabilityCheck["status"]) {
  if (status === "ok") return "border-emerald-400/35 bg-emerald-400/12 text-emerald-200";
  if (status === "warn") return "border-amber-400/35 bg-amber-400/12 text-amber-200";
  return "border-rose-400/35 bg-rose-400/12 text-rose-200";
}

export function LaunchReliabilityPanel({
  checks,
}: {
  checks: ReliabilityCheck[];
}) {
  const okCount = checks.filter((c) => c.status === "ok").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0c0d0e]/90 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
            Launch reliability
          </h2>
          <p className="mt-1 text-xs text-tos-muted">
            Quick health read for realtime stack, broker execution path and launch-critical config.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-semibold text-white">{okCount}/{checks.length} healthy</p>
          <p className="text-[10px] text-tos-dim">{warnCount} warn · {failCount} fail</p>
        </div>
      </header>

      {failCount > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            One or more critical checks are failing. Fix these before premium launch traffic.
          </p>
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {checks.map((check) => (
          <li
            key={check.id}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-white">{check.label}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${chipClass(check.status)}`}>
                {check.status}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-tos-muted">{check.detail}</p>
            {check.actionHref && check.actionLabel ? (
              <Link
                href={check.actionHref}
                className="mt-1 inline-flex text-[11px] font-medium text-[color:var(--icon-actions)] hover:underline"
              >
                {check.actionLabel} →
              </Link>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] text-tos-muted">
        <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/60" />
        <p>
          Runbook: if realtime degrades, verify WS on <Link href="/chart" className="text-white/80 underline-offset-2 hover:underline">Chart</Link>, then check MT5 connection on{" "}
          <Link href="/accounts" className="text-white/80 underline-offset-2 hover:underline">Accounts</Link>, then validate order lifecycle on{" "}
          <Link href="/positions" className="text-white/80 underline-offset-2 hover:underline">Positions</Link>.
        </p>
      </div>
    </section>
  );
}

