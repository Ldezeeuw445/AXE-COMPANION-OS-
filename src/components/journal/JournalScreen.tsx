"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { BookOpen } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { useAppTopBar } from "@/components/shell/AppTopBarContext";
import { AxeContextToolbar, type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";
import { setLiveStatus, clearLiveStatusScope } from "@/lib/liveStatusBus";
import type { JournalEntryRow, TradeHighlight } from "@/lib/journal/loadJournalPageData";
import type { JournalAnalytics } from "@/lib/journal/computeJournalAnalytics";
import { TradeJournalLabelForm } from "@/components/journal/TradeJournalLabelForm";
import { JournalAnalyticsPanel } from "@/components/journal/JournalAnalyticsPanel";

type Props = {
  entries: JournalEntryRow[];
  tradeHighlight: TradeHighlight | null;
  journalTrades: TradeHighlight[];
  analytics: JournalAnalytics | null;
  activeAccountId: string | null;
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

export function JournalScreen({
  entries,
  tradeHighlight,
  journalTrades,
  analytics,
  activeAccountId,
  loadError,
}: Props) {
  const rowsToShow = tradeHighlight
    ? journalTrades.filter((t) => t.id !== tradeHighlight.id)
    : journalTrades;

  const focusSymbol = tradeHighlight?.symbol ?? journalTrades[0]?.symbol ?? null;

  const toolbarSections: AxeToolbarSection[] = useMemo(
    () => [
      {
        id: "ask-axe",
        title: "Ask AXE",
        items: [
          {
            id: "review",
            label: "Review my recent trades",
            description: "Patterns, mistakes, next rule",
            href: `/chat?q=${encodeURIComponent(
              `[AXE · journal]\nReview my recent MT5 trades and journal tags. Extract patterns, mistakes, and one concrete rule to enforce next week.`,
            )}`,
          },
          {
            id: "setup",
            label: "Journal this setup",
            description: focusSymbol ? `${focusSymbol} — what to log` : "What to log",
            href: `/chat?q=${encodeURIComponent(
              `[AXE · journal]\nGive me a short journal checklist for my next trade${focusSymbol ? ` on ${focusSymbol}` : ""}: bias, entry reason, invalidation, exit plan, emotions.`,
            )}`,
          },
        ],
      },
      {
        id: "shortcuts",
        title: "Shortcuts",
        items: [
          { id: "history", label: "History", description: "Closed trades ledger", href: "/history" },
          { id: "vault", label: "Vault", description: "Save insights", href: "/vault" },
        ],
      },
    ],
    [focusSymbol],
  );

  const { setCenter, setRight } = useAppTopBar();
  useEffect(() => {
    // Top bar centre stays clear — AXE wordmark + pulse owns it now.
    setCenter(null);
    setRight(<AxeContextToolbar title="Journal" subtitle={focusSymbol ? `${focusSymbol} review` : "Trades & notes"} sections={toolbarSections} />);
    return () => {
      setCenter(null);
      setRight(null);
    };
  }, [focusSymbol, setCenter, setRight, toolbarSections]);

  // Pulse: green when Supabase delivered the journal payload, amber on
  // load errors, dim if there are no entries yet (account is alive but
  // hasn't journaled anything — silence beats fake green).
  useEffect(() => {
    const ok = !loadError;
    const hasContent = entries.length > 0 || journalTrades.length > 0;
    setLiveStatus({
      allLive: !ok ? false : hasContent ? true : null,
      liveCount: ok ? 1 : 0,
      totalCount: 1,
      freshestAgeSec: null,
      label: `Journal · ${entries.length} notes · ${journalTrades.length} trades`,
      severity: !ok ? "degraded" : hasContent ? "fresh" : "inactive",
      reason: !ok
        ? "Journal data could not load."
        : hasContent
          ? "Journal and trade ledger data loaded."
          : "No journal/trade sample yet.",
      scope: "journal",
    });
    return () => clearLiveStatusScope("journal");
  }, [entries.length, journalTrades.length, loadError]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
      <ScreenHeader
        title="Journal"
        subtitle="Preset tags per trade, analytics, and free-form notes — same ledger as History."
        left={<BookOpen className="h-6 w-6 text-cyan-400/80" aria-hidden />}
        right={
          <div className="flex items-center gap-2">
            <Badge variant="warm">Supabase</Badge>
            <span className="hidden md:inline-flex">
              <AxeContextToolbar title="Journal" subtitle={focusSymbol ? `${focusSymbol} review` : "Trades & notes"} sections={toolbarSections} />
            </span>
          </div>
        }
      />

      {loadError ? (
        <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {loadError}
        </p>
      ) : null}

      {!activeAccountId ? (
        <GlassPanel className="!p-4 text-sm text-tos-muted">
          Set an <strong className="text-tos-text">active account</strong> on{" "}
          <Link href="/accounts" className="text-cyan-400 hover:underline">
            Accounts
          </Link>{" "}
          to load trades and journal analytics here.
        </GlassPanel>
      ) : null}

      {analytics && activeAccountId ? <JournalAnalyticsPanel analytics={analytics} /> : null}

      {tradeHighlight ? (
        <GlassPanel className="!p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-tos-muted">
            Open from history
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
            Current tag: {tradeHighlight.label ?? "—"}
            {tradeHighlight.note ? ` — ${tradeHighlight.note}` : ""}
          </p>
          <TradeJournalLabelForm trade={tradeHighlight} />
          <Link href="/journal" className="mt-3 inline-block text-xs text-cyan-400 hover:underline">
            ← All journal trades
          </Link>
        </GlassPanel>
      ) : null}

      {activeAccountId && rowsToShow.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
            Trades ({journalTrades.length} recent)
          </p>
          {rowsToShow.map((t) => (
            <GlassPanel key={t.id} className="!p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-tos-text">{t.symbol}</span>
                <span className={`text-sm font-medium ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {t.pnl.toFixed(2)}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-tos-dim">
                <span className="capitalize">{t.side}</span>
                {t.close_time ? <> · {fmt(t.close_time)}</> : null}
                {t.label ? (
                  <>
                    {" "}
                    · <span className="text-cyan-300/90">Tag: {t.label}</span>
                  </>
                ) : null}
              </p>
              <TradeJournalLabelForm trade={t} compact />
            </GlassPanel>
          ))}
        </div>
      ) : activeAccountId && journalTrades.length === 0 && !tradeHighlight ? (
        <GlassPanel className="!py-8 text-center text-sm text-tos-muted">
          No closed trades in <code className="text-[11px] text-tos-text">broker_trades</code> for the active account
          yet. Sync from{" "}
          <Link href="/accounts" className="text-cyan-400 hover:underline">
            Accounts
          </Link>{" "}
          or post via ingest.
        </GlassPanel>
      ) : null}

      {entries.length === 0 ? (
        <GlassPanel className="!py-8 text-center text-sm text-tos-muted">
          No free-form rows in <code className="text-[11px] text-tos-text">user_journal_entries</code> yet.
        </GlassPanel>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">Free-form notes</p>
          {entries.map((e) => (
            <GlassPanel key={e.id} className="!p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-tos-text">{e.symbol}</span>
                <span className="text-[10px] text-tos-muted">{fmt(e.created_at)}</span>
              </div>
              {e.rating ? (
                <p className="mt-1 text-[10px] uppercase text-tos-muted">Rating: {e.rating}</p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-tos-muted">{e.notes}</p>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
