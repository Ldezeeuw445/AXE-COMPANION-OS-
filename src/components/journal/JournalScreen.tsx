"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import type { JournalEntryRow, TradeHighlight } from "@/lib/journal/loadJournalPageData";

type Props = {
  entries: JournalEntryRow[];
  tradeHighlight: TradeHighlight | null;
  loadError: string | null;
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function JournalScreen({ entries, tradeHighlight, loadError }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
      <ScreenHeader
        title="Journal"
        subtitle="Notes plus trade context — labels from trade_journal_labels when you open a trade from History."
        left={<BookOpen className="h-6 w-6 text-tos-warm/80" aria-hidden />}
        right={<Badge variant="warm">Supabase</Badge>}
      />

      {loadError ? (
        <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {loadError}
        </p>
      ) : null}

      {tradeHighlight ? (
        <GlassPanel className="!p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-tos-muted">
            Linked trade (from history)
          </p>
          <p className="mt-2 text-sm text-tos-text">
            <span className="font-semibold">{tradeHighlight.symbol}</span>{" "}
            <span className="capitalize">{tradeHighlight.side}</span> · PnL{" "}
            <span
              className={
                tradeHighlight.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
              }
            >
              {tradeHighlight.pnl.toFixed(2)}
            </span>
            {tradeHighlight.close_time ? (
              <span className="text-tos-muted"> · {fmt(tradeHighlight.close_time)}</span>
            ) : null}
          </p>
          <p className="mt-2 text-xs text-tos-muted">
            Label: {tradeHighlight.label ?? "—"} {tradeHighlight.note ? `— ${tradeHighlight.note}` : ""}
          </p>
          <Link
            href="/history"
            className="mt-3 inline-block text-xs text-tos-warm hover:underline"
          >
            ← Back to history
          </Link>
        </GlassPanel>
      ) : null}

      {entries.length === 0 ? (
        <GlassPanel className="!py-12 text-center text-sm text-tos-muted">
          No free-form journal rows yet in <code className="text-[11px] text-tos-text">user_journal_entries</code>.
          Trade-specific labels live on rows in{" "}
          <Link href="/history" className="text-tos-warm hover:underline">
            History
          </Link>{" "}
          (journal link per trade).
        </GlassPanel>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <GlassPanel key={e.id} className="!p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-tos-text">{e.symbol}</span>
                <span className="text-[10px] text-tos-muted">{fmt(e.created_at)}</span>
              </div>
              {e.rating ? (
                <p className="mt-1 text-[10px] uppercase text-tos-muted">Rating: {e.rating}</p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-tos-muted">
                {e.notes}
              </p>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
