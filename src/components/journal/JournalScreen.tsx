"use client";

/**
 * JournalScreen — Auto-journal every closed trade.
 *
 * Clean trade list with inline tag/note editing.
 * Dual scoring: user tag (preset) + AXE score (future AI).
 * Analytics panel shows patterns from tagged trades.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { useAppTopBar } from "@/components/shell/AppTopBarContext";
import { AxeContextToolbar, type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";
import { setLiveStatus, clearLiveStatusScope } from "@/lib/liveStatusBus";
import type { JournalEntryRow, TradeHighlight } from "@/lib/journal/loadJournalPageData";
import type { JournalAnalytics } from "@/lib/journal/computeJournalAnalytics";
import { JOURNAL_TRADE_TAGS } from "@/lib/journal/tradeTags";
import { AlignmentBadge } from "@/components/journal/AlignmentBadge";
import { upsertTradeJournalLabelAction } from "@/app/actions/journalLabels";
import {
  ChevronDown,
  ChevronRight,
  Hash,
  AlertTriangle,
  TrendingUp,
  Zap,
  Filter,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────── */

type Props = {
  entries: JournalEntryRow[];
  tradeHighlight: TradeHighlight | null;
  journalTrades: TradeHighlight[];
  analytics: JournalAnalytics | null;
  activeAccountId: string | null;
  loadError: string | null;
};

/* ── Helpers ────────────────────────────────────────────────────── */

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtPnl(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

const TAG_COLORS: Record<string, string> = {
  Perfect: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Good: "bg-emerald-500/10 text-emerald-400/70 border-emerald-500/20",
  OK: "bg-white/[0.06] text-white/50 border-white/10",
  Impatient: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  Poor: "bg-rose-500/10 text-rose-400/70 border-rose-500/20",
  Emotional: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

/** AXE tag badge — slightly different style (cyan accent) */
const AXE_TAG_STYLE = "bg-cyan-500/10 text-cyan-400/80 border-cyan-500/20";

type FilterMode = "all" | "tagged" | "untagged" | "winners" | "losers";

/* ── Inline Trade Row ───────────────────────────────────────────── */

function TradeRow({
  trade,
  expanded,
  onToggle,
}: {
  trade: TradeHighlight;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState(trade.note ?? "");
  const [selectedTag, setSelectedTag] = useState<string | null>(trade.label);

  // Sync when server data updates
  useEffect(() => {
    setSelectedTag(trade.label);
    setNote(trade.note ?? "");
  }, [trade.label, trade.note]);

  const handleSave = useCallback(async () => {
    if (!selectedTag && !note.trim()) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("tradeId", trade.id);
    fd.set("accountId", trade.accountId);
    if (selectedTag) fd.set("label", selectedTag);
    fd.set("note", note.trim());
    const result = await upsertTradeJournalLabelAction(undefined, fd);
    setSaving(false);
    if (result?.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    }
  }, [selectedTag, note, trade.id, trade.accountId, router]);

  const tagColor = selectedTag ? TAG_COLORS[selectedTag] ?? TAG_COLORS.OK : "";

  return (
    <div className={`border-b border-white/[0.04] ${expanded ? "bg-white/[0.015]" : ""}`}>
      {/* Row header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors active:bg-white/[0.03]"
      >
        {/* Expand chevron */}
        <span className="shrink-0 text-white/20">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* Symbol + side */}
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[13px] font-bold text-white">
            {trade.symbol}
          </span>
          <span className={`ml-1.5 text-[10px] font-semibold uppercase ${
            trade.side === "buy" ? "text-emerald-400/60" : "text-rose-400/60"
          }`}>
            {trade.side}
          </span>
        </div>

        {/* Tag badges — user + AXE dual scoring */}
        <div className="flex max-w-[10.5rem] shrink-0 flex-wrap items-center justify-end gap-1">
          {selectedTag && (
            <span className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[9px] font-semibold ${tagColor}`}>
              {selectedTag}
            </span>
          )}
          {trade.axe_label && (
            <span className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[9px] font-semibold ${AXE_TAG_STYLE}`} title={trade.axe_note ?? "AXE score"}>
              ⚡{trade.axe_label}{trade.alignment_score != null ? ` ${trade.alignment_score}` : ""}
            </span>
          )}
        </div>

        {/* PnL */}
        <span className={`min-w-[54px] text-right font-mono text-[12px] font-semibold tabular-nums ${
          trade.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
        }`}>
          {fmtPnl(trade.pnl)}
        </span>

        {/* Date */}
        <span className="hidden min-w-[80px] text-right text-[10px] text-white/25 sm:block">
          {trade.close_time ? fmt(trade.close_time) : "—"}
        </span>
      </button>

      {/* Expanded: tag selector + note + AXE score */}
      {expanded && (
        <div className="space-y-3 px-4 pb-4 pl-10">
          {/* AXE alignment score (if available) */}
          {(trade.alignment_score != null || trade.axe_label) && (
            <div className="rounded-lg border border-cyan-500/10 bg-cyan-500/[0.03] px-3 py-2">
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-cyan-400/40">
                ⚡ AXE Alignment
              </p>
              {trade.alignment_score != null ? (
                <AlignmentBadge
                  score={trade.alignment_score}
                  axeLabel={trade.axe_label}
                  axeNote={trade.axe_note}
                  breakdown={trade.axe_journal ?? null}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${AXE_TAG_STYLE}`}>
                    {trade.axe_label}
                  </span>
                  {trade.axe_note && (
                    <span className="text-[11px] text-white/40">{trade.axe_note}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tag buttons */}
          <div>
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-white/25">
              Your tag
            </p>
            <div className="flex flex-wrap gap-1.5">
              {JOURNAL_TRADE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
                    selectedTag === tag
                      ? TAG_COLORS[tag]
                      : "border-white/[0.08] bg-white/[0.03] text-white/40 hover:border-white/[0.12] hover:text-white/60"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Quick note for AXE…"
              rows={2}
              className="w-full resize-none rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-white/80 placeholder:text-white/20 focus:border-white/[0.12] focus:outline-none"
            />
          </div>

          {/* Save */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (!selectedTag && !note.trim())}
              className="rounded-lg border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-white/80 transition-colors hover:bg-cyan-500/15 hover:text-cyan-300 disabled:opacity-30"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && (
              <span className="text-[10px] text-emerald-400/80">✓ Saved</span>
            )}
            <Link
              href={`/chart?symbol=${encodeURIComponent(trade.symbol)}`}
              className="ml-auto text-[10px] text-white/30 hover:text-white/60"
            >
              View chart →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Analytics Mini ─────────────────────────────────────────────── */

function AnalyticsMini({ analytics }: { analytics: JournalAnalytics }) {
  const a = analytics;
  if (a.totalTrades === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25">
          Analytics
        </p>
        <p className="mt-2 text-[12px] text-white/40">
          Close your first trade to see analytics here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25">
        Analytics
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniStat
          icon={<Hash size={12} className="text-emerald-400" />}
          label="Top tag"
          value={a.topTagAllTime ? `${a.topTagAllTime} (${a.topTagAllTimeCount})` : "—"}
        />
        <MiniStat
          icon={<AlertTriangle size={12} className="text-rose-400" />}
          label="Worst tag"
          value={a.mostCommonLosingTag ?? "—"}
        />
        <MiniStat
          icon={<TrendingUp size={12} className="text-sky-400" />}
          label="Best avg PnL"
          value={
            a.bestPerformingTag
              ? `${a.bestPerformingTag} · ${a.bestPerformingTagAvgPnl?.toFixed(2) ?? "—"}`
              : "—"
          }
        />
        <MiniStat
          icon={<Zap size={12} className="text-amber-300" />}
          label="Impatient avg"
          value={
            a.impatientCount > 0
              ? `${a.avgPnlWhenImpatient?.toFixed(2)} (n=${a.impatientCount})`
              : "—"
          }
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-cyan-400/50 transition-all"
            style={{ width: `${Math.min(100, a.completionPct)}%` }}
          />
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-white/40">
          {a.completionPct}% tagged
        </span>
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/[0.04] bg-white/[0.01] px-2.5 py-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[8px] font-semibold uppercase tracking-wider text-white/20">{label}</p>
        <p className="mt-0.5 text-[11px] font-medium text-white/60">{value}</p>
      </div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────── */

export function JournalScreen({
  entries,
  tradeHighlight,
  journalTrades,
  analytics,
  activeAccountId,
  loadError,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(tradeHighlight?.id ?? null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const autoJournalAttemptedRef = useRef(false);
  const router = useRouter();

  // Catch up trades that closed before background auto-journal ran.
  useEffect(() => {
    if (!activeAccountId || autoJournalAttemptedRef.current) return;
    const needsAxeJournal = journalTrades.some((t) => !t.axe_label);
    if (!needsAxeJournal) return;
    autoJournalAttemptedRef.current = true;
    void fetch("/api/axe-journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: activeAccountId }),
    })
      .then((res) => (res.ok ? router.refresh() : undefined))
      .catch(() => undefined);
  }, [activeAccountId, journalTrades, router]);

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
        ],
      },
    ],
    [focusSymbol],
  );

  const { setCenter, setRight } = useAppTopBar();
  useEffect(() => {
    setCenter(null);
    setRight(
      <AxeContextToolbar
        title="Journal"
        subtitle={focusSymbol ? `${focusSymbol} review` : "Trades & notes"}
        sections={toolbarSections}
      />,
    );
    return () => {
      setCenter(null);
      setRight(null);
    };
  }, [focusSymbol, setCenter, setRight, toolbarSections]);

  useEffect(() => {
    const ok = !loadError;
    const hasContent = entries.length > 0 || journalTrades.length > 0;
    setLiveStatus({
      allLive: !ok ? false : hasContent ? true : null,
      liveCount: ok ? 1 : 0,
      totalCount: 1,
      freshestAgeSec: null,
      label: `Journal · ${journalTrades.length} trades · ${entries.length} notes`,
      severity: !ok ? "degraded" : hasContent ? "fresh" : "inactive",
      reason: !ok
        ? "Journal data could not load."
        : hasContent
          ? "Journal and trade data loaded."
          : "No trades yet.",
      scope: "journal",
    });
    return () => clearLiveStatusScope("journal");
  }, [entries.length, journalTrades.length, loadError]);

  /* ── Filter trades ─────────────────────────────────────────────── */

  const filteredTrades = useMemo(() => {
    let list = journalTrades;
    switch (filter) {
      case "tagged":
        list = list.filter((t) => t.label != null);
        break;
      case "untagged":
        list = list.filter((t) => t.label == null);
        break;
      case "winners":
        list = list.filter((t) => t.pnl >= 0);
        break;
      case "losers":
        list = list.filter((t) => t.pnl < 0);
        break;
    }
    return list;
  }, [journalTrades, filter]);

  const untaggedCount = journalTrades.filter((t) => !t.label).length;

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTitleInjector title="Journal" />

      {loadError && (
        <div className="mx-4 mt-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-300">
          {loadError}
        </div>
      )}

      {!activeAccountId && (
        <div className="mx-4 mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center">
          <p className="text-[13px] text-white/50">
            Set an active account on{" "}
            <Link href="/accounts" className="text-cyan-400/70 hover:text-cyan-400">
              Accounts
            </Link>{" "}
            to load trades.
          </p>
        </div>
      )}

      {/* Analytics */}
      {analytics && activeAccountId && (
        <div className="px-4 pt-3">
          <AnalyticsMini analytics={analytics} />
        </div>
      )}

      {/* Trade count + filter bar */}
      {activeAccountId && journalTrades.length > 0 && (
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-white/90">Trades</span>
            <span className="text-[11px] font-medium text-white/30">
              {filteredTrades.length}
              {filter !== "all" ? ` / ${journalTrades.length}` : ""}
            </span>
            {untaggedCount > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-400">
                {untaggedCount} untagged
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Filter size={12} className="text-white/20" />
            {(["all", "untagged", "winners", "losers"] as FilterMode[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-md px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                  filter === f
                    ? "bg-white/[0.08] text-white/70"
                    : "text-white/25 hover:text-white/40"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Trade list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Highlighted trade (from history link) */}
        {tradeHighlight && (
          <div className="border-b-2 border-cyan-400/20 bg-cyan-400/[0.03]">
            <TradeRow
              trade={tradeHighlight}
              expanded={expandedId === tradeHighlight.id}
              onToggle={() =>
                setExpandedId((prev) =>
                  prev === tradeHighlight.id ? null : tradeHighlight.id,
                )
              }
            />
          </div>
        )}

        {filteredTrades.length === 0 && activeAccountId && journalTrades.length > 0 && (
          <div className="px-4 py-8 text-center text-[12px] text-white/30">
            No trades match "{filter}" filter
          </div>
        )}

        {filteredTrades.length === 0 && journalTrades.length === 0 && activeAccountId && (
          <div className="px-4 py-12 text-center">
            <p className="text-[13px] text-white/40">No closed trades yet</p>
            <p className="mt-1 text-[11px] text-white/25">
              Sync from{" "}
              <Link href="/accounts" className="text-cyan-400/60 hover:text-cyan-400">
                Accounts
              </Link>{" "}
              to start journaling.
            </p>
          </div>
        )}

        {filteredTrades
          .filter((t) => t.id !== tradeHighlight?.id)
          .map((trade) => (
            <TradeRow
              key={trade.id}
              trade={trade}
              expanded={expandedId === trade.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === trade.id ? null : trade.id))
              }
            />
          ))}
      </div>

      {/* Free-form notes (if any exist) */}
      {entries.length > 0 && (
        <div className="border-t border-white/[0.06] px-4 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-white/20">
            Notes ({entries.length})
          </p>
          <div className="mt-2 max-h-[120px] space-y-1.5 overflow-y-auto">
            {entries.map((e) => (
              <div
                key={e.id}
                className="flex items-baseline justify-between gap-2 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[11px] font-semibold text-white/60">
                    {e.symbol}
                  </span>
                  <span className="ml-2 text-[10px] text-white/30">
                    {e.notes.length > 60 ? `${e.notes.slice(0, 60)}…` : e.notes}
                  </span>
                </div>
                <span className="shrink-0 text-[9px] text-white/15">{fmt(e.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
