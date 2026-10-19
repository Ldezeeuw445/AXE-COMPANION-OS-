"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { QuickJournalSheet } from "@/components/journal/QuickJournalSheet";
import { applySessionAccount, type QuickJournalDraft } from "@/lib/journal/quickJournalDraft";
import { flushOfflineJournalQueue } from "@/lib/journal/flushOfflineJournalQueue";
import { useActiveSession } from "@/lib/session/activeSessionStore";

export type OpenQuickJournalArgs = {
  tradeId?: string;
  accountId?: string;
  symbol?: string;
  draft?: QuickJournalDraft;
  persist?: boolean;
};

type HostApi = {
  openQuickJournal: (args: OpenQuickJournalArgs) => void;
  closeQuickJournal: () => void;
};

const QuickJournalContext = createContext<HostApi | null>(null);

export function useQuickJournal(): HostApi {
  const ctx = useContext(QuickJournalContext);
  if (!ctx) {
    return {
      openQuickJournal: () => undefined,
      closeQuickJournal: () => undefined,
    };
  }
  return ctx;
}

export function QuickJournalHost({ children }: { children: ReactNode }) {
  const session = useActiveSession();
  const [draft, setDraft] = useState<QuickJournalDraft | null>(null);
  const [persist, setPersist] = useState(true);
  const [loading, setLoading] = useState(false);
  const [emptyHint, setEmptyHint] = useState<string | null>(null);

  useEffect(() => {
    const onOnline = () => {
      void flushOfflineJournalQueue();
    };
    window.addEventListener("online", onOnline);
    void flushOfflineJournalQueue();
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const closeQuickJournal = useCallback(() => {
    setDraft(null);
    setEmptyHint(null);
    setLoading(false);
  }, []);

  const openQuickJournal = useCallback(
    (args: OpenQuickJournalArgs) => {
      setPersist(args.persist !== false);
      setEmptyHint(null);
      if (args.draft) {
        setDraft(applySessionAccount(args.draft, session));
        return;
      }

      const accountId = args.accountId || session.accountId;
      setLoading(true);
      const url = args.tradeId && accountId
        ? `/api/journal/quick?tradeId=${encodeURIComponent(args.tradeId)}&accountId=${encodeURIComponent(accountId)}`
        : `/api/journal/last-close?${new URLSearchParams({
            ...(accountId ? { accountId } : {}),
            ...(args.symbol || session.symbol ? { symbol: args.symbol || session.symbol } : {}),
          }).toString()}`;

      void fetch(url, { credentials: "include" })
        .then(async (res) => {
          const data = (await res.json()) as { ok?: boolean; draft?: QuickJournalDraft | null };
          if (data.draft) {
            setDraft(applySessionAccount(data.draft, session));
            return;
          }
          setEmptyHint("No closed trade to journal on this account yet.");
        })
        .catch(() => {
          setEmptyHint("Could not load the trade.");
        })
        .finally(() => setLoading(false));
    },
    [session],
  );

  const api = useMemo(() => ({ openQuickJournal, closeQuickJournal }), [openQuickJournal, closeQuickJournal]);

  return (
    <QuickJournalContext.Provider value={api}>
      {children}
      {loading ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[109] flex justify-center">
          <p className="rounded-full bg-black/70 px-3 py-1 text-[11px] text-white/70">Opening journal…</p>
        </div>
      ) : null}
      {emptyHint && !draft ? (
        <button
          type="button"
          className="fixed inset-x-4 bottom-24 z-[109] rounded-xl border border-white/10 bg-[#111115] px-3 py-2 text-left text-[12px] text-white/70"
          onClick={closeQuickJournal}
        >
          {emptyHint}
        </button>
      ) : null}
      {draft ? (
        <QuickJournalSheet draft={draft} persist={persist} onClose={closeQuickJournal} />
      ) : null}
    </QuickJournalContext.Provider>
  );
}
