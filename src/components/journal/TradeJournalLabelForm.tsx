"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  upsertTradeJournalLabelAction,
  type SaveTradeLabelResult,
} from "@/app/actions/journalLabels";
import type { TradeHighlight } from "@/lib/journal/loadJournalPageData";
import { JOURNAL_TRADE_TAGS, isJournalTradeTag } from "@/lib/journal/tradeTags";

type Props = {
  trade: TradeHighlight;
  /** Tighter layout when many trades are listed */
  compact?: boolean;
};

export function TradeJournalLabelForm({ trade, compact }: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<SaveTradeLabelResult | undefined, FormData>(
    upsertTradeJournalLabelAction,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state?.ok, router]);

  const legacy =
    trade.label && !isJournalTradeTag(trade.label)
      ? `Earlier free-text label: “${trade.label}” — pick a preset below to save.`
      : null;

  return (
    <form action={formAction} className={`space-y-3 border-t border-white/[0.08] ${compact ? "pt-3" : "mt-4 pt-4"}`}>
      <input type="hidden" name="tradeId" value={trade.id} />
      <input type="hidden" name="accountId" value={trade.accountId} />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-tos-muted">Preset tag</p>
      {legacy ? <p className="text-[10px] text-amber-200/90">{legacy}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {JOURNAL_TRADE_TAGS.map((tag) => (
          <label
            key={tag}
            className="cursor-pointer rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-tos-muted transition hover:border-cyan-500/35 hover:text-cyan-200/90 has-[:checked]:border-cyan-400/50 has-[:checked]:bg-cyan-500/15 has-[:checked]:text-cyan-100"
          >
            <input
              type="radio"
              name="label"
              value={tag}
              defaultChecked={trade.label === tag}
              className="sr-only"
            />
            {tag}
          </label>
        ))}
      </div>
      <div>
        <label htmlFor={`tj-note-${trade.id}`} className="text-[10px] uppercase tracking-wider text-tos-dim">
          Note (optional)
        </label>
        <textarea
          id={`tj-note-${trade.id}`}
          name="note"
          defaultValue={trade.note ?? ""}
          rows={compact ? 2 : 3}
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
          Saved. AXE context updates on the next message.
        </p>
      ) : null}
      <button
        type="submit"
        className="rounded-xl border border-cyan-500/35 bg-cyan-500/12 px-4 py-2 text-xs font-semibold text-cyan-200/95 hover:bg-cyan-500/20"
      >
        Save tag
      </button>
    </form>
  );
}
