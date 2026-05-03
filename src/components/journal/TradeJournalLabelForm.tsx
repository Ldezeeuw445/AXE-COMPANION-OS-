"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  upsertTradeJournalLabelAction,
  type SaveTradeLabelResult,
} from "@/app/actions/journalLabels";
import type { TradeHighlight } from "@/lib/journal/loadJournalPageData";

type Props = {
  trade: TradeHighlight;
};

export function TradeJournalLabelForm({ trade }: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<SaveTradeLabelResult | undefined, FormData>(
    upsertTradeJournalLabelAction,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state?.ok, router]);

  return (
    <form action={formAction} className="mt-4 space-y-3 border-t border-white/[0.08] pt-4">
      <input type="hidden" name="tradeId" value={trade.id} />
      <input type="hidden" name="accountId" value={trade.accountId} />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-tos-muted">
        Trade label (trade_journal_labels)
      </p>
      <div>
        <label htmlFor="tj-label" className="text-[10px] uppercase tracking-wider text-tos-dim">
          Label
        </label>
        <input
          id="tj-label"
          name="label"
          defaultValue={trade.label ?? ""}
          placeholder="e.g. A+ setup, rule break"
          className="tos-neu-inset mt-1 w-full rounded-xl px-3 py-2 text-sm text-tos-text placeholder:text-tos-dim"
        />
      </div>
      <div>
        <label htmlFor="tj-note" className="text-[10px] uppercase tracking-wider text-tos-dim">
          Note
        </label>
        <textarea
          id="tj-note"
          name="note"
          defaultValue={trade.note ?? ""}
          rows={3}
          placeholder="Short context for AXE…"
          className="tos-neu-inset mt-1 w-full resize-y rounded-xl px-3 py-2 text-sm text-tos-text placeholder:text-tos-dim"
        />
      </div>
      {state?.error ? (
        <p className="rounded-lg bg-red-500/10 px-2 py-1.5 text-xs text-red-300" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="text-xs text-emerald-400/95" role="status">
          Saved. AXE context will pick this up on the next message.
        </p>
      ) : null}
      <button
        type="submit"
        className="rounded-xl border border-tos-warm/35 bg-tos-warm/12 px-4 py-2 text-xs font-semibold text-tos-warm hover:bg-tos-warm/20"
      >
        Save label
      </button>
    </form>
  );
}
