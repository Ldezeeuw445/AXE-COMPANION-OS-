import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, StickyNote, Trash2 } from 'lucide-react';
import { useSymbol } from '@/contexts/SymbolContext';
import { useSupabaseSession } from '@/lib/supabaseAuth';
import { getTradingAdapter } from '@/lib/tradingAdapterSingleton';
import type { BrokerAccount, BrokerTrade, JournalAnalytics, JournalLabel } from '@/engine/types/broker';
import { fetchWorkspacePreferences } from '@/lib/userPreferencesCloud';
import { loadJournalEntries, type JournalEntry, type JournalRating } from '@/lib/tradingJournalStore';
import { loadNotes, type TradingNote } from '@/lib/tradingNotesStore';
import {
  createNoteHybrid,
  deleteJournalHybrid,
  deleteNoteHybrid,
  insertJournalHybrid,
  loadJournalHybrid,
  loadNotesHybrid,
  saveNoteHybrid,
} from '@/lib/userWorkspaceCloud';

const LABELS: { value: JournalLabel; label: string; tone: string }[] = [
  { value: 'PerfectlyExecuted', label: 'Perfectly executed', tone: 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10' },
  { value: 'Good', label: 'Good', tone: 'text-cyan-200 border-cyan-500/25 bg-cyan-500/10' },
  { value: 'Impatient', label: 'Impatient', tone: 'text-amber-200 border-amber-500/25 bg-amber-500/10' },
  { value: 'EmotionalWreck', label: 'Emotional wreck', tone: 'text-orange-200 border-orange-500/25 bg-orange-500/10' },
  { value: 'VeryStupid', label: 'Very stupid', tone: 'text-red-200 border-red-500/25 bg-red-500/10' },
];

const RATINGS: { value: JournalRating; label: string }[] = [
  { value: 'perfect', label: 'Perfect' },
  { value: 'good', label: 'Good' },
  { value: 'ok', label: 'OK' },
  { value: 'poor', label: 'Poor' },
  { value: 'emotional', label: 'Emotional' },
];

export default function JournalWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = tabParam === 'journal' ? 'journal' : tabParam === 'trades' ? 'trades' : 'notes';
  const setTab = (t: 'notes' | 'journal' | 'trades') => {
    if (t === 'notes') setSearchParams({});
    else setSearchParams({ tab: t });
  };

  const { symbol } = useSymbol();
  const { userId } = useSupabaseSession();
  const adapter = useMemo(() => getTradingAdapter(), []);
  const [notes, setNotes] = useState<TradingNote[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [cloudErr, setCloudErr] = useState<string | null>(null);
  const [selNoteId, setSelNoteId] = useState<string | null>(null);

  // AXE Phase 1 — broker trade journal (real trades)
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [trades, setTrades] = useState<BrokerTrade[]>([]);
  const [labelsByTradeId, setLabelsByTradeId] = useState<Record<string, { label: JournalLabel; note?: string | null; updatedAt: string }>>({});
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
  const [tradeLoad, setTradeLoad] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [tradeErr, setTradeErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCloudErr(null);
      const [n, j] = await Promise.all([loadNotesHybrid(userId), loadJournalHybrid(userId)]);
      setNotes(n);
      setJournal(j);
      return { notes: n, journal: j } as const;
    } catch (e) {
      setCloudErr(e instanceof Error ? e.message : String(e));
      const n = loadNotes();
      const jl = loadJournalEntries();
      setNotes(n);
      setJournal(jl);
      return { notes: n, journal: jl } as const;
    }
  }, [userId]);

  const refreshTrades = useCallback(async () => {
    if (!userId) {
      setAccounts([]);
      setActiveAccountId(null);
      setTrades([]);
      setLabelsByTradeId({});
      setAnalytics(null);
      setTradeLoad('idle');
      setTradeErr(null);
      return;
    }

    setTradeLoad('loading');
    setTradeErr(null);
    try {
      const [acctRows, prefs] = await Promise.all([
        adapter.listBrokerAccounts(userId),
        fetchWorkspacePreferences(userId).catch(() => null),
      ]);
      setAccounts(acctRows);
      const prefAcct = prefs?.active_account_id ?? null;
      const nextActive = prefAcct && acctRows.some((a) => a.id === prefAcct) ? prefAcct : acctRows[0]?.id ?? null;
      setActiveAccountId(nextActive);

      if (!nextActive) {
        setTrades([]);
        setLabelsByTradeId({});
        setAnalytics(null);
        setTradeLoad('ok');
        return;
      }

      const [{ trades: t, labelsByTradeId: map }, an] = await Promise.all([
        adapter.getTradeHistory(userId, { accountId: nextActive, limit: 250, label: 'all' }),
        adapter.getJournalAnalytics(userId, { accountId: nextActive }),
      ]);
      setTrades(t);
      setLabelsByTradeId(map);
      setAnalytics(an);
      setTradeLoad('ok');
    } catch (e) {
      setTradeLoad('error');
      setTradeErr(e instanceof Error ? e.message : String(e));
      setTrades([]);
      setLabelsByTradeId({});
      setAnalytics(null);
    }
  }, [adapter, userId]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const r = await refresh();
      if (cancel) return;
      setSelNoteId((prev) => (prev && r.notes.some((x) => x.id === prev) ? prev : r.notes[0]?.id ?? null));
    })();
    return () => {
      cancel = true;
    };
  }, [userId, refresh]);

  useEffect(() => {
    void refreshTrades();
  }, [refreshTrades]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  const selected = useMemo(() => notes.find((n) => n.id === selNoteId) ?? null, [notes, selNoteId]);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');

  useEffect(() => {
    if (selected) {
      setDraftTitle(selected.title);
      setDraftBody(selected.body);
    } else {
      setDraftTitle('');
      setDraftBody('');
    }
  }, [selected?.id]);

  const [jNotes, setJNotes] = useState('');
  const [jTags, setJTags] = useState('');
  const [jPnl, setJPnl] = useState('');
  const [jRating, setJRating] = useState<JournalRating | undefined>();

  const saveCurrentNote = async () => {
    if (!selected) return;
    const next: TradingNote = {
      ...selected,
      title: draftTitle.trim() || 'Untitled',
      body: draftBody,
      symbol,
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveNoteHybrid(userId, next);
      await refresh();
    } catch (e) {
      setCloudErr(e instanceof Error ? e.message : String(e));
    }
  };

  const onNewNote = async () => {
    try {
      const n = await createNoteHybrid(userId, { title: 'New note', body: '', symbol });
      await refresh();
      setSelNoteId(n.id);
      setTab('notes');
    } catch (e) {
      setCloudErr(e instanceof Error ? e.message : String(e));
    }
  };

  const onDeleteNote = async (id: string) => {
    try {
      await deleteNoteHybrid(userId, id);
      const r = await refresh();
      setSelNoteId((cur) => (cur === id ? r.notes[0]?.id ?? null : cur));
    } catch (e) {
      setCloudErr(e instanceof Error ? e.message : String(e));
    }
  };

  const onAddJournal = async () => {
    const raw = jPnl.trim();
    let pnl: number | undefined;
    if (raw !== '') {
      const n = Number(raw);
      pnl = Number.isFinite(n) ? n : undefined;
    }
    try {
      await insertJournalHybrid(userId, {
        symbol,
        notes: jNotes.trim() || '(no notes)',
        tags: jTags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        pnl,
        rating: jRating,
      });
      setJNotes('');
      setJTags('');
      setJPnl('');
      setJRating(undefined);
      await refresh();
    } catch (e) {
      setCloudErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-2">
          <StickyNote size={14} className="text-cyan-400" aria-hidden />
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">WORKSPACE</span>
          <span className="text-[10px] text-white/35">
            {userId ? 'Notes + journal synced to your account (Supabase)' : 'Notes + journal stored on this device — sign in to sync'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-white/30">{symbol}</span>
      </div>

      {cloudErr ? (
        <div className="mx-4 mt-2 rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-100/90">
          {cloudErr}
        </div>
      ) : null}

      <div className="flex gap-1 px-4 pt-2 border-b border-white/[0.04]">
        <button
          type="button"
          onClick={() => setTab('notes')}
          className={`px-3 py-1.5 rounded-t text-[10px] font-medium transition-colors ${
            tab === 'notes' ? 'bg-white/[0.06] text-cyan-300 border border-b-0 border-white/10' : 'text-white/40 hover:text-white/65'
          }`}
        >
          Notes
        </button>
        <button
          type="button"
          onClick={() => setTab('journal')}
          className={`px-3 py-1.5 rounded-t text-[10px] font-medium transition-colors ${
            tab === 'journal' ? 'bg-white/[0.06] text-cyan-300 border border-b-0 border-white/10' : 'text-white/40 hover:text-white/65'
          }`}
        >
          Trade journal
        </button>
        <button
          type="button"
          onClick={() => setTab('trades')}
          className={`px-3 py-1.5 rounded-t text-[10px] font-medium transition-colors ${
            tab === 'trades' ? 'bg-white/[0.06] text-cyan-300 border border-b-0 border-white/10' : 'text-white/40 hover:text-white/65'
          }`}
        >
          Broker trades
        </button>
      </div>

      <div className="p-4">
        {tab === 'notes' ? (
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
            <div className="tos-card rounded-lg overflow-hidden flex flex-col min-h-[280px]">
              <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                <span className="tos-block-title text-[10px]">SHELF</span>
                <button
                  type="button"
                  onClick={() => void onNewNote()}
                  className="text-[10px] text-cyan-400 hover:underline"
                >
                  + New
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide p-1">
                {notes.length === 0 ? (
                  <p className="text-[10px] text-white/25 p-2">No notes yet.</p>
                ) : (
                  notes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setSelNoteId(n.id)}
                      className={`w-full text-left px-2 py-1.5 rounded text-[10px] mb-0.5 transition-colors ${
                        n.id === selNoteId ? 'bg-cyan-500/10 text-cyan-200' : 'text-white/45 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="truncate font-medium">{n.title}</div>
                      <div className="text-[9px] text-white/25 truncate">{n.updatedAt.slice(0, 10)}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="tos-card rounded-lg overflow-hidden flex flex-col min-h-[280px]">
              <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                <span className="tos-block-title text-[10px]">EDITOR</span>
                {selected ? (
                  <button
                    type="button"
                    onClick={() => void onDeleteNote(selected.id)}
                    className="text-white/30 hover:text-red-400 p-1"
                    title="Delete note"
                  >
                    <Trash2 size={12} />
                  </button>
                ) : null}
              </div>
              {selected ? (
                <div className="p-3 flex flex-col flex-1 gap-2 min-h-0">
                  <input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/40"
                    placeholder="Title"
                  />
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    className="flex-1 min-h-[160px] w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white/85 resize-y focus:outline-none focus:border-cyan-500/40"
                    placeholder="Write your note…"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] text-white/25">Symbol tag: {symbol}</span>
                    <button
                      type="button"
                      onClick={() => void saveCurrentNote()}
                      className="px-3 py-1 rounded bg-cyan-500/20 text-[10px] font-medium text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/30"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-[11px] text-white/30">Create a note to start.</div>
              )}
            </div>
          </div>
        ) : tab === 'journal' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="tos-card rounded-lg overflow-hidden p-3 space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-yellow-500/80" />
                <span className="tos-block-title text-[10px]">NEW ENTRY</span>
              </div>
              <p className="text-[9px] text-white/30 leading-relaxed">
                Log how the session felt, tags (comma-separated), optional P&amp;L number. Uses active pair:{' '}
                <span className="font-mono text-white/45">{symbol}</span>.
              </p>
              <textarea
                value={jNotes}
                onChange={(e) => setJNotes(e.target.value)}
                className="w-full min-h-[100px] bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white/85 focus:outline-none focus:border-cyan-500/40"
                placeholder="Session notes…"
              />
              <input
                value={jTags}
                onChange={(e) => setJTags(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-cyan-500/40"
                placeholder="Tags: breakout, fomo, plan"
              />
              <input
                value={jPnl}
                onChange={(e) => setJPnl(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-cyan-500/40"
                placeholder="P&L (optional number)"
              />
              <div className="flex flex-wrap gap-1">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setJRating((cur) => (cur === r.value ? undefined : r.value))}
                    className={`px-2 py-1 rounded text-[9px] border transition-colors ${
                      jRating === r.value
                        ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/35'
                        : 'bg-white/[0.03] text-white/40 border-white/10 hover:border-white/20'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void onAddJournal()}
                className="w-full py-2 rounded bg-cyan-500/15 text-[11px] font-medium text-cyan-200 border border-cyan-500/25 hover:bg-cyan-500/25"
              >
                Add journal entry
              </button>
            </div>
            <div className="tos-card rounded-lg overflow-hidden flex flex-col min-h-[320px]">
              <div className="px-3 py-2 border-b border-white/5">
                <span className="tos-block-title text-[10px]">ENTRIES ({journal.length})</span>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide p-2 space-y-2">
                {journal.length === 0 ? (
                  <p className="text-[10px] text-white/25 p-2 text-center">No entries yet.</p>
                ) : (
                  journal.map((e) => (
                    <div
                      key={e.id}
                      className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2 flex gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-[9px] text-white/35 font-mono">
                          <span>{e.symbol}</span>
                          <span>{e.createdAt.slice(0, 16).replace('T', ' ')}</span>
                          {e.rating ? <span className="text-cyan-400/80">{e.rating}</span> : null}
                          {typeof e.pnl === 'number' ? (
                            <span className={e.pnl >= 0 ? 'text-emerald-400/90' : 'text-red-400/90'}>{e.pnl}</span>
                          ) : null}
                        </div>
                        {e.tags.length > 0 ? (
                          <div className="text-[8px] text-white/25 mt-0.5">{e.tags.join(' · ')}</div>
                        ) : null}
                        <p className="text-[11px] text-white/65 mt-1 whitespace-pre-wrap break-words">{e.notes}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void (async () => {
                            try {
                              await deleteJournalHybrid(userId, e.id);
                              await refresh();
                            } catch (err) {
                              setCloudErr(err instanceof Error ? err.message : String(err));
                            }
                          })()
                        }
                        className="shrink-0 self-start text-white/25 hover:text-red-400 p-1"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="tos-card rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
              <span className="tos-block-title text-[10px]">BROKER TRADES</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-[10px] text-cyan-300/80 hover:underline"
                  onClick={() => void refreshTrades()}
                >
                  Refresh
                </button>
              </div>
            </div>

            {!userId ? (
              <div className="p-6 text-center text-[11px] text-white/35">
                Sign in to connect an account and load real trades.
              </div>
            ) : tradeLoad === 'error' ? (
              <div className="p-4 text-[10px] text-red-200/90 border-b border-red-500/20 bg-red-500/5">{tradeErr}</div>
            ) : null}

            <div className="p-3 space-y-3">
              {userId ? (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-wider">Active account</div>
                      <div className="text-[11px] text-white/70">
                        {activeAccountId ? accounts.find((a) => a.id === activeAccountId)?.label ?? 'Account' : '—'}
                      </div>
                      <div className="text-[10px] text-white/30">{accounts.length} linked</div>
                    </div>
                    <select
                      value={activeAccountId ?? ''}
                      onChange={(e) => {
                        const id = e.target.value || null;
                        setActiveAccountId(id);
                        if (userId) {
                          void adapter.setActiveAccount(userId, id).then(() => refreshTrades());
                        }
                      }}
                      className="bg-black/40 border border-white/10 rounded px-2 py-2 text-[11px] text-white/70"
                    >
                      <option value="">No account</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!activeAccountId ? (
                    <div className="mt-2 text-[10px] text-white/35">
                      No linked account selected. Create/link an MT5 account in AXE Companion to start ingesting trades.
                    </div>
                  ) : analytics ? (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        ['Trades', String(analytics.trades)],
                        ['Win rate', `${Math.round(analytics.winRate * 100)}%`],
                        ['Profit factor', analytics.profitFactor == null ? '—' : analytics.profitFactor.toFixed(2)],
                        ['Total P&L', analytics.totalPnl.toFixed(2)],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded border border-white/[0.06] bg-black/20 px-2 py-1.5">
                          <div className="text-[9px] text-white/30 uppercase tracking-wider">{k}</div>
                          <div className="text-[12px] font-mono text-white/70 tabular-nums">{v}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tradeLoad === 'loading' ? (
                <div className="p-6 text-center text-[11px] text-white/35">Loading trades…</div>
              ) : activeAccountId && trades.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-white/35">
                  No trades ingested yet. Once MT5 starts posting fills into AXE, they’ll appear here automatically.
                </div>
              ) : null}

              {trades.length > 0 ? (
                <div className="space-y-2">
                  {trades.map((t) => {
                    const lbl = labelsByTradeId[t.id]?.label ?? null;
                    return (
                      <div key={t.id} className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] text-white/35 font-mono">
                              {t.symbol} · {t.side.toUpperCase()} · {t.volume} · P&L{' '}
                              <span className={t.pnl >= 0 ? 'text-emerald-400/90' : 'text-red-400/90'}>{t.pnl.toFixed(2)}</span>
                            </div>
                            <div className="text-[9px] text-white/25 font-mono">
                              {t.closeTime ? t.closeTime.slice(0, 19).replace('T', ' ') : '—'} · #{t.externalTradeId}
                            </div>
                          </div>
                          {lbl ? (
                            <span className="text-[9px] px-2 py-0.5 rounded border border-white/10 bg-white/5 text-white/60">
                              {LABELS.find((x) => x.value === lbl)?.label ?? lbl}
                            </span>
                          ) : (
                            <span className="text-[9px] text-white/25">Unlabeled</span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1 mt-2">
                          {LABELS.map((x) => (
                            <button
                              key={x.value}
                              type="button"
                              className={`text-[9px] px-2 py-1 rounded border transition-colors ${
                                lbl === x.value ? x.tone : 'border-white/10 bg-white/[0.03] text-white/45 hover:border-white/20'
                              }`}
                              onClick={() => {
                                if (!userId || !activeAccountId) return;
                                void adapter
                                  .labelTrade(userId, { tradeId: t.id, accountId: activeAccountId, label: x.value, note: null })
                                  .then(() => refreshTrades());
                              }}
                            >
                              {x.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
