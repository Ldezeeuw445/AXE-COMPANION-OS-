"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  disconnectCloudMt5AccountAction,
  recoverCloudMt5AccountAction,
  syncCloudMt5AccountAction,
  testCloudMt5ConnectionAction,
} from "@/app/actions/mt5Cloud";
import { AxeBreatheLoader } from "@/components/ui/AxeBreatheLoader";

type Props = {
  accountId: string;
};

const ACTION_TIMEOUT_MS: Record<string, number> = {
  Test: 25_000,
  Sync: 75_000,
  Redeploy: 75_000,
  Disconnect: 25_000,
};

type ActionResult = { ok: boolean; code?: string; message?: string; data?: unknown };

function timeoutResult(label: string): ActionResult {
  return {
    ok: false,
    code: "client_timeout",
    message:
      label === "Sync" || label === "Redeploy"
        ? "Sync is still running in the background. Refresh Accounts in a minute or retry if the status does not change."
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

      if (r.ok && label === "Sync") {
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
            headline:
              label === "Test"
                ? "Connection test passed."
                : label === "Redeploy"
                  ? "Recovery request completed."
                  : "Done.",
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
          onClick={() => run(recoverCloudMt5AccountAction, "Redeploy")}
          className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-amber-100/90 hover:bg-amber-400/20 disabled:opacity-50"
        >
          {busyLabel === "Redeploy" ? "Recovering…" : "Redeploy"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Disconnect this AXE MT5 Cloud account? Trade history in AXE is kept.")) return;
            run(disconnectCloudMt5AccountAction, "Disconnect");
          }}
          className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-red-200/90 hover:bg-red-500/20 disabled:opacity-50"
        >
          {busyLabel === "Disconnect" ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
      {busyLabel ? (
        <div className="space-y-1.5">
          <AxeBreatheLoader label={busyLabel === "Sync" ? "Syncing account" : busyLabel === "Redeploy" ? "Recovering account" : "Checking account"} size="sm" />
          <p className="text-[10px] leading-relaxed text-tos-dim">
          {busyLabel === "Sync"
            ? "AXE is syncing broker history. If the broker is slow, this panel will release and keep the account usable."
            : busyLabel === "Redeploy"
              ? "AXE is redeploying the cloud terminal, then checking whether the broker terminal comes back online."
            : "AXE is checking the account. This will release automatically if the runtime stalls."}
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
    </div>
  );
}
