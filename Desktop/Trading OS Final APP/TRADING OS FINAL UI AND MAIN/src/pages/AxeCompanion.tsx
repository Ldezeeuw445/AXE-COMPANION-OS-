import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSymbol } from '@/contexts/SymbolContext';
import { useSupabaseSession } from '@/lib/supabaseAuth';
import { getTradingAdapter } from '@/lib/tradingAdapterSingleton';
import { getAppMode } from '@/lib/appMode';
import { useAxeChatQuotaMeter } from '@/hooks/useAxeChatQuotaMeter';
import { AxeCompanionInstallDialog } from '@/components/axe/AxeCompanionInstallDialog';
import type { AxeContext, AxeMemoryItem, AxeStatus } from '@/engine/types/axe';
import type { BrokerAccount } from '@/engine/types/broker';
import {
  Cpu, Database, Zap, BrainCircuit,
  MessageSquare, Clock, AlertTriangle, Radio, Paperclip,
  ChevronRight, Sparkles, Lock, TrendingUp, Shield,
  Plug, HardDrive, Eye, Volume2, FolderOpen, CheckCircle2,
  Bot, BarChart3, Target, Lightbulb, Activity, Smartphone, Download
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────

function StatusBadge({ label, status }: { label: string; status: 'online' | 'offline' | 'pending' | 'warning' }) {
  const config = {
    online:   { dot: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/8', border: 'border-emerald-500/15' },
    offline:  { dot: 'bg-red-500',     text: 'text-red-400',     bg: 'bg-red-500/8',     border: 'border-red-500/15' },
    pending:  { dot: 'bg-amber-500',   text: 'text-amber-400',   bg: 'bg-amber-500/8',   border: 'border-amber-500/15' },
    warning:  { dot: 'bg-orange-500',  text: 'text-orange-400',  bg: 'bg-orange-500/8',  border: 'border-orange-500/15' },
  };
  const c = config[status];
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${c.bg} border ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'pending' ? 'animate-pulse' : ''}`} />
      <span className={`text-[9px] font-medium ${c.text}`}>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUMMARY CARD
// ─────────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, sub, empty, color = 'cyan' }: {
  icon: React.ElementType; label: string; value?: string; sub?: string; empty?: boolean; color?: string;
}) {
  const colorMap: Record<string, { icon: string; border: string; bg: string }> = {
    cyan:   { icon: 'text-cyan-400',   border: 'border-cyan-500/10',   bg: 'bg-cyan-500/5' },
    purple: { icon: 'text-purple-400', border: 'border-purple-500/10', bg: 'bg-purple-500/5' },
    lime:   { icon: 'text-lime-400',   border: 'border-lime-500/10',   bg: 'bg-lime-500/5' },
    amber:  { icon: 'text-amber-400',  border: 'border-amber-500/10',  bg: 'bg-amber-500/5' },
  };
  const c = colorMap[color] || colorMap.cyan;
  return (
    <div className={`rounded-lg border border-white/[0.04] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-3 ${empty ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`w-7 h-7 rounded-md ${c.bg} border ${c.border} flex items-center justify-center`}>
          <Icon size={14} className={c.icon} />
        </div>
        <span className="text-[10px] text-white/40 uppercase tracking-wider">{label}</span>
      </div>
      {empty ? (
        <div className="space-y-1">
          <div className="text-[11px] text-white/30 italic">{value || 'Awaiting engine data'}</div>
          {sub && <div className="text-[9px] text-white/20">{sub}</div>}
        </div>
      ) : (
        <div className="space-y-0.5">
          <div className="text-lg font-semibold text-white/80 tabular-nums">{value}</div>
          {sub && <div className="text-[9px] text-white/30">{sub}</div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STATUS ROW
// ─────────────────────────────────────────────────────────────

function StatusRow({ icon: Icon, label, status, detail }: {
  icon: React.ElementType; label: string; status: string; detail: string;
}) {
  const statusConfig: Record<string, { color: string; bg: string }> = {
    'Disconnected':   { color: 'text-red-400',    bg: 'bg-red-500/8' },
    'Connected':      { color: 'text-emerald-400', bg: 'bg-emerald-500/8' },
    'Pending':        { color: 'text-amber-400',   bg: 'bg-amber-500/8' },
    'Idle':           { color: 'text-white/30',    bg: 'bg-white/5' },
    'Synced':         { color: 'text-emerald-400', bg: 'bg-emerald-500/8' },
    'No data':        { color: 'text-white/30',    bg: 'bg-white/5' },
    'Ready':          { color: 'text-cyan-400',    bg: 'bg-cyan-500/8' },
    'Off':            { color: 'text-white/20',    bg: 'bg-white/5' },
  };
  const s = statusConfig[status] || statusConfig['Idle'];
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
      <div className="flex items-center gap-2">
        <Icon size={12} className="text-white/30" />
        <span className="text-[10px] text-white/50">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-white/25">{detail}</span>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${s.color} ${s.bg}`}>{status}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INTEGRATION CARD
// ─────────────────────────────────────────────────────────────

function IntegrationCard({ icon: Icon, title, desc, status, actions }: {
  icon: React.ElementType; title: string; desc: string; status: string; actions: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-white/[0.04] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
            <Icon size={15} className="text-purple-400" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-white/80">{title}</div>
            <div className="text-[9px] text-white/30 mt-0.5">{desc}</div>
          </div>
        </div>
        <StatusBadge label={status} status={status === 'Connected' ? 'online' : status === 'Pending' ? 'pending' : 'offline'} />
      </div>

      <div className="space-y-1.5 mb-3">
        {actions.map((a, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px] text-white/40">
            <ChevronRight size={10} className="text-white/20" />
            {a}
          </div>
        ))}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full py-1.5 rounded text-[9px] text-white/30 border border-white/[0.04] hover:bg-white/[0.03] hover:text-white/50 transition-all"
      >
        {expanded ? 'Collapse' : 'Configure'}
      </button>

      {expanded && (
        <div className="mt-2 p-2 rounded bg-white/[0.02] border border-white/[0.04]">
          <div className="text-[9px] text-white/25 mb-1">Adapter configuration — ready for integration</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-6 rounded bg-white/[0.03] border border-white/[0.05] flex items-center px-2">
              <span className="text-[9px] text-white/20">Endpoint URL</span>
            </div>
            <button className="px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-[9px] text-purple-400 hover:bg-purple-500/20 transition-all">
              Connect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function AxeCompanion() {
  const { symbol } = useSymbol();
  const { userId } = useSupabaseSession();
  const adapter = useMemo(() => getTradingAdapter(), []);
  const appMode = getAppMode();
  const { usage: freeAiUsage } = useAxeChatQuotaMeter(userId, appMode);

  const [axeContext, setAxeContext] = useState<AxeContext | null>(null);
  const [axeMemory, setAxeMemory] = useState<AxeMemoryItem[]>([]);
  const [axeStatus, setAxeStatus] = useState<AxeStatus | null>(null);
  const [axeError, setAxeError] = useState<string | null>(null);
  const [axeLoad, setAxeLoad] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  // AXE Phase 1 — broker link tokens (shown once) + account list
  const [brokerAccounts, setBrokerAccounts] = useState<BrokerAccount[]>([]);
  const [brokerLoad, setBrokerLoad] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [brokerError, setBrokerError] = useState<string | null>(null);
  const [newAcctLabel, setNewAcctLabel] = useState('Funded MT5');
  const [newMt5Login, setNewMt5Login] = useState('');
  const [newMt5Server, setNewMt5Server] = useState('');
  const [linkTokenOnce, setLinkTokenOnce] = useState<string | null>(null);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  /** Recommended: in-app cloud MT5 (read-only analytics) — password never stored client-side. */
  const [cloudLabel, setCloudLabel] = useState('Live MT5');
  const [cloudLogin, setCloudLogin] = useState('');
  const [cloudServer, setCloudServer] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudRegion, setCloudRegion] = useState('');
  const [cloudReadOnlyAck, setCloudReadOnlyAck] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudUiHint, setCloudUiHint] = useState<string | null>(null);
  const [engineStrip, setEngineStrip] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    let alive = true;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const fetchOnce = () => {
      void adapter
        .getEngineStatus()
        .then((r) => {
          if (!alive) return;
          setEngineStrip({ status: r.status, message: r.message });
        })
        .catch(() => {
          if (!alive) return;
          setEngineStrip({ status: 'critical', message: 'Engine status unavailable' });
        });
    };

    const startInterval = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') fetchOnce();
      }, 30_000);
    };

    const onVisibility = () => {
      if (!alive) return;
      if (document.visibilityState === 'visible') {
        fetchOnce();
        startInterval();
      } else if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    fetchOnce();
    if (document.visibilityState === 'visible') startInterval();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      alive = false;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [adapter]);

  useEffect(() => {
    if (!userId) {
      setAxeContext(null);
      setAxeMemory([]);
      setAxeStatus(null);
      setAxeError(null);
      setAxeLoad('idle');
      return;
    }
    let alive = true;
    setAxeLoad('loading');
    setAxeError(null);
    (async () => {
      try {
        const [ctx, mem, st] = await Promise.all([
          adapter.getAxeContext(symbol, '1H', userId),
          adapter.getAxeMemory(userId, symbol),
          adapter.getAxeStatus(userId),
        ]);
        if (!alive) return;
        setAxeContext(ctx);
        setAxeMemory(mem);
        setAxeStatus(st);
        setAxeLoad('ok');
      } catch (e) {
        if (!alive) return;
        setAxeLoad('error');
        setAxeError(e instanceof Error ? e.message : String(e));
        setAxeContext(null);
        setAxeMemory([]);
        setAxeStatus(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [adapter, userId, symbol]);

  useEffect(() => {
    if (!userId) {
      setBrokerAccounts([]);
      setBrokerLoad('idle');
      setBrokerError(null);
      return;
    }
    let alive = true;
    setBrokerLoad('loading');
    setBrokerError(null);
    void adapter
      .listBrokerAccounts(userId)
      .then((rows) => {
        if (!alive) return;
        setBrokerAccounts(rows);
        setBrokerLoad('ok');
      })
      .catch((e) => {
        if (!alive) return;
        setBrokerAccounts([]);
        setBrokerLoad('error');
        setBrokerError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [adapter, userId]);

  const confPct = axeContext ? Math.round(axeContext.confidence * 100) : null;
  const topSignal = axeContext?.signals?.[0];

  return (
    <>
    <div className="flex min-h-dvh min-h-0 flex-col bg-[#0a0a0a]">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#0a0a0a] scrollbar-hide overscroll-y-contain">
      {/* ═══════════════════════════════════════════
          HERO HEADER
         ═══════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/[0.1] flex-shrink-0"
            style={{ boxShadow: '0 0 12px rgba(139,92,246,0.2)' }}>
            <img src="/assets/axe-logo.png" alt="AXE" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white/90">AXE Companion</span>
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/8 border border-purple-500/15">
                <Sparkles size={9} className="text-purple-400" />
                <span className="text-[8px] text-purple-400 font-medium">PREMIUM</span>
              </div>
            </div>
            <div className="text-[9px] text-white/30 mt-0.5">
              Your AI trading copilot — same Supabase spine as Trading OS (our upcoming premium terminal). AXE Companion is the brain; Trading OS is the terminal.
            </div>
          </div>
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {freeAiUsage ? (
            <div
              className="order-last rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[9px] text-cyan-100/90 sm:order-none"
              title={
                freeAiUsage.kind === 'unlimited'
                  ? freeAiUsage.reason === 'env'
                    ? 'Whole-build flag VITE_AXE_AI_UNLIMITED — use only for dev. For production, prefer per-user chat_quota_exempt in Supabase.'
                    : freeAiUsage.reason === 'exempt'
                      ? 'Your user has chat_quota_exempt in Supabase (tester / internal). Server enforces via axe_chat_try_consume.'
                      : 'Pro plan (Supabase). Chat quota bypass on server.'
                  : freeAiUsage.period === 'day_utc'
                    ? 'Live daily chat quota from Supabase (UTC). Enforced in Companion on send.'
                    : 'Local preview counter when not signed in or if status RPC failed — not server-enforced.'
              }
            >
              {freeAiUsage.kind === 'unlimited' ? (
                <>
                  AI: <span className="font-medium text-cyan-50">Unlimited</span>
                  <span className="text-cyan-200/50">
                    {freeAiUsage.reason === 'env'
                      ? ' (build)'
                      : freeAiUsage.reason === 'exempt'
                        ? ' (tester)'
                        : ' (Pro)'}
                  </span>
                </>
              ) : (
                <>
                  Free AI:{' '}
                  <span className="font-mono tabular-nums text-cyan-50">
                    {freeAiUsage.used}/{freeAiUsage.limit}
                  </span>
                  <span className="text-cyan-200/50">
                    {freeAiUsage.period === 'day_utc' ? ' / day UTC' : ' / mo'}
                  </span>
                </>
              )}
            </div>
          ) : null}
          <StatusBadge label="Session" status={userId ? 'online' : 'offline'} />
          <StatusBadge label="Engine" status={axeContext ? 'online' : userId ? 'pending' : 'offline'} />
          <StatusBadge label="Memory" status={axeMemory.length ? 'online' : userId ? 'pending' : 'offline'} />
        </div>
      </div>

      {engineStrip ? (
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.04] bg-[#0a0a0a] px-4 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Activity size={11} className="shrink-0 text-cyan-400/80" />
            <span className="shrink-0 text-[9px] uppercase tracking-wider text-white/40">Desk engine</span>
            <span className="truncate text-[9px] text-white/55" title={engineStrip.message}>
              {engineStrip.message}
            </span>
          </div>
          <span
            className={`shrink-0 text-[9px] font-medium capitalize ${
              engineStrip.status === 'healthy'
                ? 'text-emerald-400'
                : engineStrip.status === 'degraded'
                  ? 'text-amber-400'
                  : 'text-red-400'
            }`}
          >
            {engineStrip.status}
          </span>
        </div>
      ) : null}

      {userId && appMode === 'axe' && brokerLoad === 'ok' && brokerAccounts.length === 0 ? (
        <div className="flex flex-col gap-3 border-b border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-emerald-100/90">
            <span className="font-semibold text-emerald-50">First run:</span> link a broker account to ingest trades, then
            label them from the journal.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-[10px] font-semibold text-emerald-50 hover:bg-emerald-500/25"
              onClick={() =>
                document.getElementById('connect-broker')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              Connect account
            </button>
            <Link
              to="/journal?tab=trades"
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-white/80 hover:bg-white/10"
            >
              Start journal
            </Link>
            <Link
              to="/journal?tab=notes"
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-white/80 hover:bg-white/10"
            >
              Add note
            </Link>
          </div>
        </div>
      ) : null}

      {!userId ? (
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-1.5 text-[10px] text-white/35">
          Sign in to load AXE context via <span className="font-mono text-white/45">getAxeContext</span>,{' '}
          <span className="font-mono text-white/45">getAxeMemory</span>,{' '}
          <span className="font-mono text-white/45">getAxeStatus</span>.
        </div>
      ) : axeLoad === 'error' ? (
        <div className="border-b border-red-500/20 bg-red-500/5 px-4 py-1.5 text-[10px] text-red-200/90">{axeError}</div>
      ) : axeLoad === 'loading' ? (
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-1.5 text-[10px] text-white/35">Loading AXE…</div>
      ) : axeContext ? (
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-1.5 text-[10px] text-white/35">
          Live: <span className="font-mono text-white/45">getAxeContext</span> ·{' '}
          <span className="font-mono text-white/45">getAxeMemory</span> · <span className="font-mono text-white/45">getAxeStatus</span>
        </div>
      ) : null}

      <div className="p-4 space-y-4">
        {/* ═══════════════════════════════════════════
            ROW 1: 4 Summary Cards
           ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-4 gap-3">
          <SummaryCard
            icon={BrainCircuit}
            label="Bias"
            value={axeContext ? axeContext.bias : undefined}
            sub={axeContext ? `Symbol ${axeContext.symbol} · ${axeContext.timeframe}` : 'Awaiting engine data'}
            empty={!axeContext}
            color="purple"
          />
          <SummaryCard
            icon={Target}
            label="Confidence"
            value={confPct != null ? `${confPct}%` : undefined}
            sub={axeContext ? 'From AXE context' : 'Connect engine to begin'}
            empty={confPct == null}
            color="cyan"
          />
          <SummaryCard
            icon={Database}
            label="Memory"
            value={axeStatus != null ? String(axeStatus.memoryCount) : undefined}
            sub={axeMemory.length ? `${axeMemory.length} loaded` : 'Waiting for first sync'}
            empty={!axeStatus}
            color="lime"
          />
          <SummaryCard
            icon={Lightbulb}
            label="Top signal"
            value={topSignal?.name}
            sub={topSignal ? `${topSignal.direction} · ${topSignal.timeframe}` : 'Engine will populate'}
            empty={!topSignal}
            color="amber"
          />
        </div>

        {/* ═══════════════════════════════════════════
            ROW 2: Behavior Profile + AXE Status
           ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-3">
          {/* Behavior Profile */}
          <div className="rounded-lg border border-white/[0.04] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bot size={14} className="text-cyan-400" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Behavior Profile</span>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Preferred session', value: axeContext ? `${axeContext.timeframe} horizon` : 'Awaiting data', icon: Clock },
                { label: 'Risk style', value: 'Not configured', icon: Shield },
                {
                  label: 'Bias tendency',
                  value: axeContext ? axeContext.bias : 'Awaiting data',
                  icon: BarChart3,
                },
                {
                  label: 'Active symbols',
                  value:
                    axeStatus && axeStatus.activeSymbols.length
                      ? axeStatus.activeSymbols.slice(0, 4).join(', ')
                      : 'No history synced',
                  icon: TrendingUp,
                },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
                  <div className="flex items-center gap-2">
                    <item.icon size={11} className="text-white/25" />
                    <span className="text-[10px] text-white/40">{item.label}</span>
                  </div>
                  <span className="text-[10px] text-white/25 italic">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AXE Status */}
          <div className="rounded-lg border border-white/[0.04] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-purple-400" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">AXE Status</span>
            </div>
            <div className="space-y-0">
              <StatusRow
                icon={Cpu}
                label="Engine"
                status={axeLoad === 'loading' ? 'Pending' : axeContext ? 'Connected' : 'Disconnected'}
                detail={axeContext ? `Updated ${new Date(axeContext.lastUpdated).toLocaleString()}` : 'Adapter ready'}
              />
              <StatusRow
                icon={Database}
                label="Memory"
                status={axeMemory.length ? 'Synced' : 'Pending'}
                detail={axeMemory.length ? `${axeMemory.length} items` : 'Awaiting sync'}
              />
              <StatusRow
                icon={AlertTriangle}
                label="Alerts"
                status={(axeStatus?.pendingAlerts ?? 0) > 0 ? 'Pending' : 'Idle'}
                detail={
                  (axeStatus?.pendingAlerts ?? 0) > 0
                    ? `${axeStatus?.pendingAlerts} pending`
                    : 'No active alerts'
                }
              />
              <StatusRow
                icon={Radio}
                label="Pair sync"
                status={axeContext ? 'Connected' : 'No data'}
                detail={`Global symbol: ${symbol}`}
              />
              <StatusRow icon={Volume2} label="Voice" status="Off" detail="Enable in settings" />
              <StatusRow icon={Paperclip} label="Attachments" status="Ready" detail="Awaiting upload" />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            ROW 3: Recent Conversations + Pending Actions
           ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-3">
          {/* Recent Conversations */}
          <div className="rounded-lg border border-white/[0.04] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-lime-400" />
                <span className="text-[10px] text-white/40 uppercase tracking-wider">Recent Conversations</span>
              </div>
              <span className="text-[9px] text-white/20">{axeMemory.length} memory</span>
            </div>
            {axeMemory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-2">
                  <MessageSquare size={16} className="text-white/15" />
                </div>
                <div className="text-[10px] text-white/25 mb-0.5">No AXE memory rows yet</div>
                <div className="text-[9px] text-white/15 mb-3">Use the floating assistant after you have a session.</div>
                {appMode === 'axe' ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link
                      to="/journal?tab=notes"
                      className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-semibold text-white/75 hover:bg-white/10"
                    >
                      Add note
                    </Link>
                    <Link
                      to="/journal?tab=trades"
                      className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-semibold text-white/75 hover:bg-white/10"
                    >
                      Start journal
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                {axeMemory.slice(0, 8).map((m) => (
                  <div key={m.id} className="rounded border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
                    <div className="text-[9px] text-white/45 uppercase">{m.type}</div>
                    <div className="text-[10px] text-white/60 line-clamp-2">{m.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Actions */}
          <div className="rounded-lg border border-white/[0.04] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FolderOpen size={14} className="text-amber-400" />
                <span className="text-[10px] text-white/40 uppercase tracking-wider">Pending Actions</span>
              </div>
              <span className="text-[9px] text-white/20">{axeStatus?.pendingAlerts ?? 0} pending</span>
            </div>
            {(axeStatus?.pendingAlerts ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-2">
                  <CheckCircle2 size={16} className="text-white/15" />
                </div>
                <div className="text-[10px] text-white/25 mb-0.5">All caught up</div>
                <div className="text-[9px] text-white/15">No unresolved alert-type memory</div>
              </div>
            ) : (
              <div className="py-4 px-2 text-[10px] text-amber-200/80">
                {axeStatus?.pendingAlerts} unresolved alert(s) in AXE memory — review in full AXE chat when available.
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            Broker accounts (MT5 ingest)
           ═══════════════════════════════════════════ */}
        <div id="connect-broker" className="scroll-mt-4 rounded-xl border border-white/[0.04] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-emerald-400/80" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Broker accounts</span>
            </div>
            <span className="text-[9px] text-white/20">{brokerAccounts.length} linked</span>
          </div>

          {!userId ? (
            <div className="text-[10px] text-white/35">
              Sign in to connect MT5. AXE never stores broker passwords in the browser or localStorage.
            </div>
          ) : brokerLoad === 'error' ? (
            <div className="text-[10px] text-red-200/90">{brokerError}</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.04] px-3 py-2 text-[9px] text-cyan-100/75 leading-relaxed">
                <span className="font-semibold text-cyan-50">Security:</span> Prefer an investor / read-only password when
                your broker allows it. Read-only access is for analytics and journaling — AXE cannot place trades with
                that mode. Execution stays disabled by default. Broker credentials are sent only to the server-side
                connector over HTTPS, not logged in the frontend. You can disconnect anytime.
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2 rounded-lg border border-emerald-500/20 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[10px] text-emerald-200/90 font-semibold uppercase tracking-wider">
                      Recommended — Connect MT5 account
                    </span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-200/80 border border-emerald-500/25">
                      Read-only analytics
                    </span>
                  </div>
                  <p className="text-[9px] text-white/35 mb-2">
                    Server-side cloud connector (e.g. MetaApi). Use for history, open positions, balance/equity, journal,
                    and chat context — not for execution.
                  </p>
                  <div className="space-y-2">
                    <input
                      value={cloudLabel}
                      onChange={(e) => setCloudLabel(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-[11px] text-white/80 focus:outline-none focus:border-emerald-500/30"
                      placeholder="Account label"
                      autoComplete="off"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={cloudLogin}
                        onChange={(e) => setCloudLogin(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-[11px] text-white/80 focus:outline-none focus:border-emerald-500/30"
                        placeholder="MT5 login"
                        inputMode="numeric"
                        autoComplete="off"
                      />
                      <input
                        value={cloudServer}
                        onChange={(e) => setCloudServer(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-[11px] text-white/80 focus:outline-none focus:border-emerald-500/30"
                        placeholder="Broker / server (e.g. Broker-Live)"
                        autoComplete="off"
                      />
                    </div>
                    <input
                      type="password"
                      value={cloudPassword}
                      onChange={(e) => setCloudPassword(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-[11px] text-white/80 focus:outline-none focus:border-emerald-500/30"
                      placeholder="Investor / read-only password"
                      autoComplete="new-password"
                    />
                    <input
                      value={cloudRegion}
                      onChange={(e) => setCloudRegion(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-[11px] text-white/80 focus:outline-none focus:border-emerald-500/30"
                      placeholder="Region (optional, if your provider needs it)"
                      autoComplete="off"
                    />
                    <label className="flex items-start gap-2 text-[10px] text-white/45 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cloudReadOnlyAck}
                        onChange={(e) => setCloudReadOnlyAck(e.target.checked)}
                        className="mt-0.5 rounded border-white/20"
                      />
                      <span>I am using read-only investor access where my broker allows it.</span>
                    </label>
                    <button
                      type="button"
                      disabled={cloudBusy}
                      className="w-full py-2 rounded bg-emerald-600/25 text-[11px] font-semibold text-emerald-100 border border-emerald-500/35 hover:bg-emerald-600/35 disabled:opacity-50"
                      onClick={() => {
                        if (!userId) return;
                        setCloudUiHint(null);
                        if (!cloudReadOnlyAck) {
                          setCloudUiHint('Please confirm read-only / investor access above.');
                          return;
                        }
                        if (!cloudLogin.trim() || !cloudServer.trim() || !cloudPassword) {
                          setCloudUiHint('MT5 login, server, and password are required.');
                          return;
                        }
                        setCloudBusy(true);
                        void adapter
                          .createCloudMt5Connection(userId, {
                            label: cloudLabel.trim() || 'MT5 Account',
                            mt5Login: cloudLogin.trim(),
                            mt5Server: cloudServer.trim(),
                            investorPassword: cloudPassword,
                            region: cloudRegion.trim() || undefined,
                            readOnlyConfirmed: cloudReadOnlyAck,
                          })
                          .then((r) => {
                            if (!r.ok) {
                              setCloudUiHint(r.message ?? r.code ?? 'Connection failed.');
                              return;
                            }
                            setCloudUiHint(r.message ?? 'Linked. Use Sync to pull trade history.');
                            setCloudPassword('');
                            return adapter.listBrokerAccounts(userId).then(setBrokerAccounts);
                          })
                          .catch((e) => setCloudUiHint(e instanceof Error ? e.message : String(e)))
                          .finally(() => setCloudBusy(false));
                      }}
                    >
                      {cloudBusy ? 'Connecting…' : 'Connect via cloud (read-only)'}
                    </button>
                    {cloudUiHint ? (
                      <div className="text-[10px] text-white/50 border border-white/[0.06] rounded px-2 py-1.5 bg-white/[0.02]">
                        {cloudUiHint}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div id="axe-mt5-token-form" className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                  <div className="text-[10px] text-amber-200/80 font-semibold uppercase tracking-wider mb-1">
                    Advanced — Local MT5 bridge
                  </div>
                  <p className="text-[9px] text-white/30 mb-2">
                    EA or bridge posts closed trades to <span className="font-mono text-white/40">axe-mt5-ingest</span> with
                    a one-time token. Best when you do not want to share broker credentials.
                  </p>
                  <div className="space-y-2">
                    <input
                      value={newAcctLabel}
                      onChange={(e) => setNewAcctLabel(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-[11px] text-white/80 focus:outline-none focus:border-emerald-500/30"
                      placeholder="Account label (e.g. Funded FTMO)"
                    />
                    <div className="grid grid-cols-1 gap-2">
                      <input
                        value={newMt5Login}
                        onChange={(e) => setNewMt5Login(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-[11px] text-white/80 focus:outline-none focus:border-emerald-500/30"
                        placeholder="MT5 login (optional)"
                      />
                      <input
                        value={newMt5Server}
                        onChange={(e) => setNewMt5Server(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-[11px] text-white/80 focus:outline-none focus:border-emerald-500/30"
                        placeholder="Server (optional)"
                      />
                    </div>
                    <button
                      type="button"
                      className="w-full py-2 rounded bg-white/[0.06] text-[11px] font-semibold text-white/80 border border-white/10 hover:bg-white/10"
                      onClick={() => {
                        if (!userId) return;
                        setLinkTokenOnce(null);
                        void adapter
                          .createBrokerAccount(userId, {
                            label: newAcctLabel.trim() || 'MT5 Account',
                            mt5Login: newMt5Login.trim() || undefined,
                            mt5Server: newMt5Server.trim() || undefined,
                          })
                          .then(({ linkToken }) => {
                            setLinkTokenOnce(linkToken);
                            return adapter.listBrokerAccounts(userId).then(setBrokerAccounts);
                          })
                          .catch((e) => setBrokerError(e instanceof Error ? e.message : String(e)));
                      }}
                    >
                      Create bridge token
                    </button>
                    {linkTokenOnce ? (
                      <div className="mt-2 rounded border border-amber-500/25 bg-amber-500/10 p-2">
                        <div className="text-[9px] text-amber-200/80 font-semibold mb-1">Bridge token (shown once)</div>
                        <div className="text-[10px] font-mono text-amber-100/90 break-all">{linkTokenOnce}</div>
                        <div className="text-[9px] text-amber-100/60 mt-1">
                          Paste into your MT5 EA. AXE stores only a SHA-256 hash.
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Linked accounts</div>
                {brokerLoad === 'loading' ? (
                  <div className="text-[10px] text-white/35">Loading…</div>
                ) : brokerAccounts.length === 0 ? (
                  <div className="space-y-2 py-2 text-center">
                    <div className="text-[10px] text-white/35">No accounts linked yet.</div>
                    <button
                      type="button"
                      className="text-[10px] font-semibold text-emerald-300/90 underline-offset-2 hover:underline"
                      onClick={() =>
                        document.getElementById('connect-broker')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                    >
                      Choose a connection method above
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[240px] overflow-y-auto scrollbar-hide">
                    {brokerAccounts.map((a) => (
                      <div key={a.id} className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] text-white/75 font-medium">{a.label}</div>
                          <span
                            className={
                              a.connectionMethod === 'cloud_mt5'
                                ? 'text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-200/90 border border-cyan-500/25'
                                : 'text-[8px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/10'
                            }
                          >
                            {a.connectionMethod === 'cloud_mt5' ? 'Cloud' : 'Bridge'}
                          </span>
                        </div>
                        <div className="text-[9px] text-white/25 font-mono mt-0.5">
                          {a.provider.toUpperCase()}
                          {(a.maskedLogin || a.mt5Login) ? ` · ${a.maskedLogin ?? a.mt5Login}` : ''}
                          {a.mt5Server ? ` · ${a.mt5Server}` : ''}
                        </div>
                        {a.providerStatus ? (
                          <div className="text-[9px] text-white/35 mt-1">
                            Status: <span className="text-white/50">{a.providerStatus}</span>
                          </div>
                        ) : null}
                        {a.connectionMethod === 'cloud_mt5' ? (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <button
                              type="button"
                              className="text-[9px] px-2 py-1 rounded border border-white/10 text-white/50 hover:bg-white/[0.04]"
                              onClick={() => {
                                if (!userId) return;
                                void adapter
                                  .syncCloudMt5Account(userId, { accountId: a.id })
                                  .then((r) => {
                                    const extra =
                                      r.dealsFetched != null
                                        ? ` (${r.dealsFetched} deals fetched, ${r.dealsUpserted ?? 0} upserted)`
                                        : '';
                                    setCloudUiHint(`${r.message ?? r.code ?? 'Sync finished.'}${extra}`);
                                    if (r.ok) return adapter.listBrokerAccounts(userId).then(setBrokerAccounts);
                                  })
                                  .catch((e) => setCloudUiHint(e instanceof Error ? e.message : String(e)));
                              }}
                            >
                              Sync
                            </button>
                            <button
                              type="button"
                              className="text-[9px] px-2 py-1 rounded border border-white/10 text-white/50 hover:bg-white/[0.04]"
                              onClick={() => {
                                if (!userId) return;
                                void adapter
                                  .testCloudMt5Connection(userId, { accountId: a.id })
                                  .then((r) => setCloudUiHint(r.message ?? r.code ?? 'Test finished.'))
                                  .catch((e) => setCloudUiHint(e instanceof Error ? e.message : String(e)));
                              }}
                            >
                              Test
                            </button>
                            <button
                              type="button"
                              className="text-[9px] px-2 py-1 rounded border border-red-500/20 text-red-200/70 hover:bg-red-500/10"
                              onClick={() => {
                                if (!userId) return;
                                void adapter
                                  .disconnectCloudMt5Account(userId, { accountId: a.id })
                                  .then((r) => {
                                    setCloudUiHint(r.message ?? r.code ?? 'Disconnected.');
                                    return adapter.listBrokerAccounts(userId).then(setBrokerAccounts);
                                  })
                                  .catch((e) => setCloudUiHint(e instanceof Error ? e.message : String(e)));
                              }}
                            >
                              Disconnect
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════
            ROW 4: AXE Integration (3 cards)
           ═══════════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Plug size={14} className="text-purple-400" />
            <span className="text-[10px] text-white/40 uppercase tracking-wider">AXE Integration</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <IntegrationCard
              icon={Zap}
              title="Engine Adapter"
              desc="Connect your AI trading engine"
              status={axeContext ? 'Connected' : 'Disconnected'}
              actions={['Connect to AXE engine API', 'Configure authentication', 'Set response model']}
            />
            <IntegrationCard
              icon={HardDrive}
              title="Memory Layer"
              desc="Persistent conversation memory"
              actions={['Enable memory sync', 'Set retention policy', 'Configure encryption']}
              status={axeMemory.length ? 'Connected' : 'Pending'}
            />
            <IntegrationCard
              icon={Eye}
              title="Pair Awareness"
              desc="Symbol-aware trading context"
              actions={['Link to global symbol', 'Enable pair tracking', 'Configure alerts']}
              status={axeContext ? 'Connected' : 'Pending'}
            />
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            AXE COMPANION MOBILE — Premium Banner
           ═══════════════════════════════════════════ */}
        <div className="relative overflow-hidden rounded-xl p-[1px] mt-3" style={{ background: 'linear-gradient(135deg, #a3e635 0%, #06b6d4 50%, #8b5cf6 100%)' }}>
          <div className="relative flex flex-col gap-4 px-5 py-4 rounded-xl bg-[#0d0d10] sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            {/* Subtle gradient glow on hover */}
            <div className="absolute inset-0 rounded-xl opacity-0 hover:opacity-100 transition-opacity pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(163,230,53,0.05) 0%, rgba(6,182,212,0.05) 50%, rgba(139,92,246,0.05) 100%)' }} />

            {/* Left: Brand logo + Slogan */}
            <div className="flex-1 flex items-center gap-4 relative z-10">
              <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/[0.1] flex-shrink-0" style={{ boxShadow: '0 0 16px rgba(139,92,246,0.2)' }}>
                <img src="/assets/axe-logo.png" alt="AXE" className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center gap-2">
                <Smartphone size={11} className="text-purple-400" />
                <span className="text-[12px] text-white/60">
                  AXE in your pocket — same intelligence layer as Trading OS, our upcoming premium desk terminal
                </span>
              </div>
            </div>

            {/* Right: CTA Button */}
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end relative z-10">
              <div className="hidden md:flex items-center gap-1.5 text-[9px] text-white/30">
                <Lock size={9} className="text-emerald-400/50" />
                <span>End-to-end encrypted</span>
                <span className="text-white/15">|</span>
                <span>Real-time sync</span>
              </div>
              <button
                type="button"
                onClick={() => setInstallDialogOpen(true)}
                className="flex w-full shrink-0 items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[10px] font-semibold text-white bg-gradient-to-r from-purple-500/80 to-cyan-500/80 hover:from-purple-500 hover:to-cyan-500 transition-all shadow-[0_0_16px_rgba(139,92,246,0.3)] hover:shadow-[0_0_24px_rgba(139,92,246,0.5)] sm:w-auto sm:py-2"
              >
                <Download size={13} />
                Get AXE Companion
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/[0.04]">
        <div className="flex items-center justify-between text-[9px] text-white/20">
          <div className="flex items-center gap-2">
            <Lock size={9} className="text-emerald-400/50" />
            <span>End-to-end encrypted</span>
            <span className="text-white/10">|</span>
            <span>AXE AI Engine v0.1</span>
          </div>
          <span>Trading OS terminal — coming soon · same account and memory</span>
        </div>
      </div>
      </div>
    </div>
    <AxeCompanionInstallDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen} />
    </>
  );
}
