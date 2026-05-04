"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  disconnectCloudMt5AccountAction,
  syncCloudMt5AccountAction,
  testCloudMt5ConnectionAction,
} from "@/app/actions/mt5Cloud";

type Props = {
  accountId: string;
};

export function Mt5CloudAccountActions({ accountId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
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
    fn: (id: string) => Promise<{ ok: boolean; code?: string; message?: string; data?: unknown }>,
    label: string,
  ) {
    setMsg(null);
    start(() => {
      void (async () => {
        const r = await fn(accountId);
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
      })();
    });
  }

  const feedback = parseMsg();

  return (
    <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(testCloudMt5ConnectionAction, "Test")}
          className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-tos-text hover:bg-white/10 disabled:opacity-50"
        >
          Test
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(syncCloudMt5AccountAction, "Sync")}
          className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-200/90 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          Sync
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
          Disconnect
        </button>
      </div>
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
