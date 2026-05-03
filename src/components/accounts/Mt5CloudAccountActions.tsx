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

  function run(
    fn: (id: string) => Promise<{ ok: boolean; code?: string; message?: string; data?: unknown }>,
    label: string,
  ) {
    setMsg(null);
    start(() => {
      void (async () => {
        const r = await fn(accountId);
        if (r.ok && label === "Sync" && r.data && typeof r.data === "object") {
          const d = r.data as { dealsFetched?: number; dealsUpserted?: number; tradesNormalized?: number };
          setMsg(
            `Synced: ${d.dealsFetched ?? 0} deals fetched, ${d.dealsUpserted ?? 0} closed positions upserted` +
              ((d.tradesNormalized ?? 0) === 0 && (d.dealsFetched ?? 0) > 0
                ? " (only open legs in window — no completed positions to write)."
                : "."),
          );
        } else if (r.ok) {
          setMsg(`${label} OK.`);
        } else {
          setMsg(`${r.code ?? "error"} — ${r.message ?? "Failed"}`);
        }
        router.refresh();
      })();
    });
  }

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
      {msg ? <p className="text-[10px] leading-relaxed text-tos-muted">{msg}</p> : null}
    </div>
  );
}
