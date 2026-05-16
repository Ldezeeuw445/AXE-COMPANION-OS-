"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  disconnectCloudMt5AccountAction,
  runCloudMt5DoctorAction,
  syncCloudMt5AccountAction,
  testCloudMt5ConnectionAction,
} from "@/app/actions/mt5Cloud";
import type { Mt5DoctorReport, Mt5DoctorStepStatus } from "@/types/mt5Doctor";

type Props = {
  accountId: string;
};

const ACTION_TIMEOUT_MS: Record<string, number> = {
  Test: 25_000,
  Sync: 75_000,
  Doctor: 60_000,
  Disconnect: 25_000,
};

type ActionResult = { ok: boolean; code?: string; message?: string; data?: unknown };

function timeoutResult(label: string): ActionResult {
  return {
    ok: false,
    code: "client_timeout",
    message:
      label === "Sync"
        ? "Sync is still running in the background. Refresh Accounts in a minute or retry if the status does not change."
        : label === "Doctor"
          ? "Doctor is still waiting on MetaAPI. Retry in a minute if the account status does not change."
        : "The request is taking longer than expected. You can retry without leaving this screen.",
  };
}

async function withClientTimeout(
  label: string,
  promise: Promise<ActionResult>,
): Promise<{ result: ActionResult; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise.then((result) => ({ result, timedOut: false })),
      new Promise<{ result: ActionResult; timedOut: boolean }>((resolve) => {
        timer = setTimeout(
          () => resolve({ result: timeoutResult(label), timedOut: true }),
          ACTION_TIMEOUT_MS[label] ?? 30_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function Mt5CloudAccountActions({ accountId }: Props) {
  const router = useRouter();
  const runIdRef = useRef(0);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [doctorReport, setDoctorReport] = useState<Mt5DoctorReport | null>(null);

  function parseMsg(): { headline: string; detail?: string } | null {
    if (!msg) return null;
    try {
      return JSON.parse(msg) as { headline: string; detail?: string };
    } catch {
      return { headline: msg };
    }
  }

  function run(
    fn: (id: string) => Promise<ActionResult>,
    label: string,
  ) {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setBusyLabel(label);
    setMsg(null);
    if (label === "Doctor") setDoctorReport(null);
    const actionPromise = fn(accountId);

    void (async () => {
      const { result: r, timedOut } = await withClientTimeout(label, actionPromise);
      if (runIdRef.current !== runId) return;

      if (timedOut) {
        setMsg(
          JSON.stringify({
            headline: label === "Sync" ? "Still syncing." : "Still working.",
            detail: r.message,
          }),
        );
        setBusyLabel(null);
        actionPromise
          .then(() => {
            if (runIdRef.current === runId) router.refresh();
          })
          .catch(() => undefined);
        return;
      }

      if (r.ok && label === "Doctor") {
        const report = r.data && typeof r.data === "object" ? (r.data as Mt5DoctorReport) : null;
        setDoctorReport(report);
        setMsg(
          JSON.stringify({
            headline: report?.headline ?? "Doctor completed.",
            detail: report?.summary,
          }),
        );
      } else if (r.ok && label === "Sync") {
        const d =
          r.data && typeof r.data === "object"
            ? (r.data as { dealsFetched?: number; dealsUpserted?: number; tradesNormalized?: number })
            : null;
        const detail =
          d != null
            ? `Fetched ${d.dealsFetched ?? 0} · Saved ${d.dealsUpserted ?? 0} closed rows` +
              ((d.tradesNormalized ?? 0) === 0 && (d.dealsFetched ?? 0) > 0
                ? " · Window had open legs only."
                : "")
            : "";
        setMsg(
          JSON.stringify({
            headline: "Sync completed.",
            detail: detail || undefined,
          }),
        );
      } else if (r.ok) {
        setMsg(
          JSON.stringify({
            headline: label === "Test" ? "Connection test passed." : "Done.",
            detail: undefined,
          }),
        );
      } else {
        setMsg(
          JSON.stringify({
            headline: "Something went wrong.",
            detail: `${r.code ?? "error"} — ${r.message ?? "Failed"}`,
          }),
        );
      }
      router.refresh();
      setBusyLabel(null);
    })().catch((e) => {
      if (runIdRef.current !== runId) return;
      setMsg(
        JSON.stringify({
          headline: "Something went wrong.",
          detail: e instanceof Error ? e.message : String(e),
        }),
      );
      setBusyLabel(null);
    });
  }

  const feedback = parseMsg();
  const pending = busyLabel != null;

  return (
    <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(testCloudMt5ConnectionAction, "Test")}
          className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-tos-text hover:bg-white/10 disabled:opacity-50"
        >
          {busyLabel === "Test" ? "Testing…" : "Test"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(syncCloudMt5AccountAction, "Sync")}
          className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-200/90 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          {busyLabel === "Sync" ? "Syncing…" : "Sync"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Disconnect this MetaApi cloud account? Trade history in AXE is kept.")) return;
            run(disconnectCloudMt5AccountAction, "Disconnect");
          }}
          className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-red-200/90 hover:bg-red-500/20 disabled:opacity-50"
        >
          {busyLabel === "Disconnect" ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
      {busyLabel ? (
        <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.65)]" aria-hidden />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-100/90">
              {busyLabel === "Sync"
                ? "Broker sync active"
                : busyLabel === "Doctor"
                  ? "Connection doctor active"
                  : "Provider check active"}
            </p>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-300/45" />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-tos-dim">
            {busyLabel === "Sync"
              ? "AXE is syncing broker history. If MetaApi is slow, this panel releases and keeps the account usable."
              : busyLabel === "Doctor"
                ? "AXE is checking MetaAPI deployment, broker reachability, positions, history and live price health."
              : "AXE is checking the account. This will release automatically if the provider stalls."}
          </p>
        </div>
      ) : null}
      {feedback ? (
        <div className="text-[10px] leading-relaxed text-tos-muted">
          <p className="text-tos-text/95">{feedback.headline}</p>
          {feedback.headline === "Something went wrong." && feedback.detail ? (
            <details className="mt-2 text-tos-dim">
              <summary className="cursor-pointer select-none hover:text-tos-muted">Details</summary>
              <p className="mt-1 font-mono text-[9px] break-all opacity-90">{feedback.detail}</p>
            </details>
          ) : feedback.detail ? (
            <p className="mt-1 text-tos-dim">{feedback.detail}</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(runCloudMt5DoctorAction, "Doctor")}
          className="rounded-lg border border-cyan-400/25 bg-cyan-400/[0.07] px-2.5 py-1.5 text-[10px] font-semibold text-cyan-100/90 hover:bg-cyan-400/14 disabled:opacity-50"
        >
          {busyLabel === "Doctor" ? "Diagnosing…" : "Run Doctor"}
        </button>
      </div>
      {doctorReport ? <DoctorReportCard report={doctorReport} /> : null}
    </div>
  );
}

function statusTone(status: Mt5DoctorStepStatus): string {
  switch (status) {
    case "pass":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100/90";
    case "warn":
      return "border-amber-400/22 bg-amber-400/[0.08] text-amber-100/90";
    case "fail":
      return "border-rose-400/24 bg-rose-400/[0.08] text-rose-100/90";
    case "skipped":
      return "border-white/10 bg-white/[0.03] text-tos-dim";
    case "unknown":
    default:
      return "border-white/10 bg-white/[0.04] text-tos-muted";
  }
}

function statusDot(status: Mt5DoctorStepStatus): string {
  switch (status) {
    case "pass":
      return "bg-emerald-300";
    case "warn":
      return "bg-amber-300";
    case "fail":
      return "bg-rose-300";
    case "skipped":
      return "bg-white/25";
    case "unknown":
    default:
      return "bg-white/35";
  }
}

function DoctorReportCard({ report }: { report: Mt5DoctorReport }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/25 px-3 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold text-tos-text">{report.headline}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-tos-dim">{report.summary}</p>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-cyan-100/80">
          {report.overallStatus.replace(/_/g, " ")}
        </span>
      </div>
      <div className="mt-3 grid gap-1.5">
        {report.steps.map((step) => (
          <div
            key={step.id}
            className={`rounded-xl border px-2.5 py-2 text-[10px] leading-relaxed ${statusTone(step.status)}`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot(step.status)}`} aria-hidden />
              <p className="font-semibold uppercase tracking-wider">{step.label}</p>
              <span className="ml-auto font-mono text-[9px] uppercase opacity-70">{step.status}</span>
            </div>
            <p className="mt-1 text-tos-dim">{step.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
