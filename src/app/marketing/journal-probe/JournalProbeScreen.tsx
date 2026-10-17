"use client";

import { ActiveSessionSeed } from "@/components/session/ActiveSessionSeed";
import { useQuickJournal } from "@/components/journal/QuickJournalHost";
import { buildQuickJournalDraft } from "@/lib/journal/quickJournalDraft";
import { useActiveSession } from "@/lib/session/activeSessionStore";

const PROBE_TRADE = {
  id: "probe-trade-1",
  accountId: "probe-acct",
  symbol: "XAUUSD",
  side: "sell",
  volume: 0.1,
  openPrice: 2651.2,
  closePrice: 2644.8,
  openTime: "2026-10-17T12:01:00.000Z",
  closeTime: "2026-10-17T12:18:00.000Z",
  pnl: 64,
  fees: -1.4,
  label: null,
  note: null,
  axe_label: "Held the plan",
  axe_note: "Fade of the London spike.",
  alignment_score: 78,
  axe_journal: { explanation: "Same short as yesterday — you waited for the reclaim." },
};

export function JournalProbeScreen() {
  const session = useActiveSession();
  const { openQuickJournal } = useQuickJournal();

  return (
    <div data-testid="journal-probe" className="flex flex-col gap-4 px-1 py-4">
      <ActiveSessionSeed
        accountId="probe-acct"
        accountLabel="Probe Live"
        accountType="live"
        symbol="XAUUSD"
        lastTab="account"
      />
      <h1 className="text-lg font-semibold text-white">Quick journal probe</h1>
      <p className="text-sm text-white/55">
        Closed XAUUSD sell. One tap opens the sheet with the trade, account and AXE draft filled in.
      </p>
      <button
        type="button"
        data-testid="journal-probe-open"
        className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-3 text-left"
        onClick={() =>
          openQuickJournal({
            persist: false,
            draft: buildQuickJournalDraft(PROBE_TRADE, session),
          })
        }
      >
        <p className="font-mono text-[13px] font-semibold text-white">XAUUSD</p>
        <p className="mt-0.5 text-[11px] text-white/45">sell · 2651.20 → 2644.80 · +62.60 net</p>
      </button>
    </div>
  );
}
