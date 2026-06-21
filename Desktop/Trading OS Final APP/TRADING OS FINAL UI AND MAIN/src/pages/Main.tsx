import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, BarChart3, Calendar, Plus, ChevronRight,
  ChevronDown, Wallet, TrendingUp, X,
  DollarSign, Activity, Briefcase, Landmark,
  Bitcoin, Zap, CircleDollarSign, TrendingUp as TrendingIcon,
  CircleDot, ChevronUp, BookOpen, Wrench, Headphones, Users,
  MessageSquare, Hash, UserPlus
} from 'lucide-react';
import { useSymbol } from '@/contexts/SymbolContext';
import { useTerminalWatchlist } from '@/contexts/WatchlistContext';
import { useSupabaseSession, useTradingOsProfile } from '@/lib/supabaseAuth';
import { getTradingAdapter } from '@/lib/tradingAdapterSingleton';
import type { AccountSummary, Position, WatchlistItem } from '@/engine/types/account';
import type { DashboardData } from '@/engine/types/dashboard';
import type { BrokerTrade, JournalAnalytics } from '@/engine/types/broker';
import { journalSnapshot, loadJournalEntries, type JournalEntry } from '@/lib/tradingJournalStore';
import { loadJournalHybrid } from '@/lib/userWorkspaceCloud';
import { fetchWorkspacePreferences } from '@/lib/userPreferencesCloud';
import {
  WATCHLIST_CATEGORY_ORDER,
  type WatchlistGroups,
} from '@/lib/watchlistDefaults';

// ============================================================================
// DATA
// ============================================================================

/** Maps workspace watchlist categories → MAIN dashboard tiles (Bloomberg-style sector strip). */
const CATEGORY_TILE_META: Record<
  (typeof WATCHLIST_CATEGORY_ORDER)[number],
  { name: string; icon: typeof Landmark; color: string }
> = {
  BONDS: { name: 'Bonds & Rates', icon: Landmark, color: 'cyan' },
  CRYPTO: { name: 'Crypto', icon: Bitcoin, color: 'purple' },
  ENERGY: { name: 'Energy', icon: Zap, color: 'orange' },
  FX: { name: 'Forex', icon: CircleDollarSign, color: 'green' },
  INDICES: { name: 'Indices', icon: TrendingIcon, color: 'blue' },
  METALS: { name: 'Metals', icon: CircleDot, color: 'yellow' },
};

const EM = '\u2014';

const statsDataFallback = [
  { label: 'WIN RATE', value: EM },
  { label: 'PROFIT FACTOR', value: EM },
  { label: 'AVG WIN', value: EM },
  { label: 'AVG LOSS', value: EM },
  { label: 'TOTAL TRADES', value: EM },
  { label: 'BEST TRADE', value: EM },
  { label: 'WORST TRADE', value: EM },
  { label: 'TOTAL P&L', value: EM },
  { label: 'MAX DRAWDOWN', value: EM },
  { label: 'MONTH P&L', value: EM },
  { label: 'WIN / LOSS DAYS', value: `${EM} / ${EM}` },
  { label: 'CONSISTENCY', value: EM },
];

function fmtMoney(n: number, currency: string): string {
  const cur = (currency || 'USD').length === 3 ? currency : 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}

function buildAccountDetailRows(
  userId: string | null,
  loadState: 'idle' | 'loading' | 'ok' | 'error',
  summary: AccountSummary | null,
): { label: string; value: string; valClass?: string }[] {
  const demoRows = [
    { label: 'Platform', value: 'MATCHTRADER' },
    { label: 'Balance', value: '$100,000' },
    { label: 'Equity', value: '$102,000', valClass: 'text-cyan-400' },
    { label: 'Free Margin', value: '$85,000' },
    { label: 'Margin Level', value: EM },
  ];
  if (!userId) return demoRows;

  if (loadState === 'loading' && !summary) {
    return [
      { label: 'Platform', value: 'TRADING OS' },
      { label: 'Balance', value: '…' },
      { label: 'Equity', value: '…' },
      { label: 'Free Margin', value: '…' },
      { label: 'Margin Level', value: '…' },
    ];
  }
  if (!summary) {
    return [
      { label: 'Platform', value: 'TRADING OS' },
      { label: 'Balance', value: EM },
      { label: 'Equity', value: EM },
      { label: 'Free Margin', value: EM },
      { label: 'Margin Level', value: EM },
    ];
  }
  const cur = summary.currency;
  const marginLevel =
    summary.marginUsed > 0.0001
      ? `${((summary.equity / summary.marginUsed) * 100).toFixed(1)}%`
      : EM;
  return [
    { label: 'Platform', value: 'TRADING OS' },
    { label: 'Balance', value: fmtMoney(summary.balance, cur) },
    {
      label: 'Equity',
      value: fmtMoney(summary.equity, cur),
      valClass: summary.openPnl >= 0 ? 'text-cyan-400/95' : 'text-amber-400/90',
    },
    { label: 'Free Margin', value: fmtMoney(summary.marginAvailable, cur) },
    { label: 'Margin Level', value: marginLevel },
  ];
}

function workspaceCategoryTiles(groups: WatchlistGroups) {
  return WATCHLIST_CATEGORY_ORDER.map((key) => {
    const meta = CATEGORY_TILE_META[key];
    const n = (groups[key] || []).length;
    return {
      key,
      name: meta.name,
      symbols: `${n} symbol${n === 1 ? '' : 's'}`,
      icon: meta.icon,
      color: meta.color,
    };
  });
}

function buildStatsFromAccount(summary: AccountSummary, positions: Position[]) {
  const openCount = positions.length;
  const totalPnl = summary.closedPnl + summary.openPnl;
  return [
    { label: 'WIN RATE', value: EM },
    { label: 'PROFIT FACTOR', value: EM },
    { label: 'AVG WIN', value: EM },
    { label: 'AVG LOSS', value: EM },
    { label: 'TOTAL TRADES', value: String(openCount) },
    { label: 'BEST TRADE', value: EM },
    { label: 'WORST TRADE', value: EM },
    { label: 'TOTAL P&L', value: fmtMoney(totalPnl, summary.currency) },
    { label: 'MAX DRAWDOWN', value: EM },
    { label: 'MONTH P&L', value: fmtMoney(summary.openPnl, summary.currency) },
    { label: 'WIN / LOSS DAYS', value: `${EM} / ${EM}` },
    { label: 'CONSISTENCY', value: EM },
  ];
}

function buildStatsFromBrokerAnalytics(a: JournalAnalytics) {
  const pf = a.profitFactor == null ? EM : a.profitFactor.toFixed(2);
  const winRate = `${Math.round(a.winRate * 100)}%`;
  const avgWin = a.avgWin == null ? EM : a.avgWin.toFixed(2);
  const avgLoss = a.avgLoss == null ? EM : a.avgLoss.toFixed(2);
  const totalTrades = String(a.trades);
  const totalPnl = a.totalPnl.toFixed(2);
  return [
    { label: 'WIN RATE', value: winRate },
    { label: 'PROFIT FACTOR', value: pf },
    { label: 'AVG WIN', value: avgWin },
    { label: 'AVG LOSS', value: avgLoss },
    { label: 'TOTAL TRADES', value: totalTrades },
    { label: 'BEST TRADE', value: EM },
    { label: 'WORST TRADE', value: EM },
    { label: 'TOTAL P&L', value: totalPnl },
    { label: 'MAX DRAWDOWN', value: EM },
    { label: 'MONTH P&L', value: totalPnl },
    { label: 'WIN / LOSS DAYS', value: `${EM} / ${EM}` },
    { label: 'CONSISTENCY', value: EM },
  ];
}

// Calendar helpers
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const today = new Date();
const currentDay = today.getDate();
const daysInMonth = getDaysInMonth(today.getFullYear(), today.getMonth());
const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

// ============================================================================
// CATEGORY TILE COMPONENT
// ============================================================================
function CategoryTile({ name, symbols, icon: Icon, color }: {
  name: string, symbols: string, icon: React.ComponentType<{ size: number; className?: string }>, color: string
}) {
  const colorStyles: Record<string, { border: string; icon: string; glow: string }> = {
    cyan: { border: 'border-cyan-500/50', icon: 'text-cyan-400', glow: 'hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]' },
    purple: { border: 'border-purple-500/50', icon: 'text-purple-400', glow: 'hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]' },
    orange: { border: 'border-orange-500/50', icon: 'text-orange-400', glow: 'hover:shadow-[0_0_20px_rgba(249,115,22,0.2)]' },
    green: { border: 'border-green-500/50', icon: 'text-green-400', glow: 'hover:shadow-[0_0_20px_rgba(34,197,94,0.2)]' },
    blue: { border: 'border-blue-500/50', icon: 'text-blue-400', glow: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]' },
    yellow: { border: 'border-yellow-500/50', icon: 'text-yellow-400', glow: 'hover:shadow-[0_0_20px_rgba(234,179,8,0.2)]' },
  };
  const style = colorStyles[color];

  return (
    <div className={`category-tile group cursor-pointer ${style.glow}`}>
      <div className={`h-full rounded-lg border ${style.border} bg-gradient-to-b from-white/[0.04] to-transparent p-4 transition-all duration-300 group-hover:from-white/[0.06] relative overflow-hidden`}>
        <div className="absolute top-3 right-3 text-white/20 group-hover:text-white/40 transition-colors">
          <ChevronRight size={16} className="rotate-[-45deg]" />
        </div>
        <div className={`mb-3 ${style.icon}`}>
          <Icon size={24} />
        </div>
        <div>
          <div className="text-sm font-medium text-white/90">{name}</div>
          <div className="text-xs text-white/40 mt-0.5">{symbols}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================
export default function Main() {
  const { symbol } = useSymbol();
  const { groups, flatSymbols } = useTerminalWatchlist();
  const { userId, userEmail } = useSupabaseSession();
  const { profile } = useTradingOsProfile(userId);
  const adapter = useMemo(() => getTradingAdapter(), []);

  const [accountSummary, setAccountSummary] = useState<AccountSummary | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [accountLoadState, setAccountLoadState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => loadJournalEntries());
  const [brokerAnalytics, setBrokerAnalytics] = useState<JournalAnalytics | null>(null);
  const [monthDailyPnl, setMonthDailyPnl] = useState<Record<number, number>>({});
  const [monthPerf, setMonthPerf] = useState<{ highest: number | null; lowest: number | null; total: number; pf: number | null }>({
    highest: null,
    lowest: null,
    total: 0,
    pf: null,
  });

  const journalSnap = useMemo(() => journalSnapshot(journalEntries), [journalEntries]);

  const displayName =
    profile?.display_name?.trim() ||
    (userEmail ? userEmail.split('@')[0] : null) ||
    'Trader';

  const statsRows = useMemo(() => {
    if (brokerAnalytics) return buildStatsFromBrokerAnalytics(brokerAnalytics);
    if (accountSummary) return buildStatsFromAccount(accountSummary, positions);
    return statsDataFallback;
  }, [brokerAnalytics, accountSummary, positions]);

  const categoryTiles = useMemo(() => workspaceCategoryTiles(groups), [groups]);

  const categoriesWithSymbols = useMemo(
    () => WATCHLIST_CATEGORY_ORDER.filter((k) => (groups[k] || []).length > 0).length,
    [groups],
  );

  const accountDetailRows = useMemo(
    () => buildAccountDetailRows(userId, accountLoadState, accountSummary),
    [userId, accountLoadState, accountSummary],
  );

  useEffect(() => {
    let alive = true;
    async function pull() {
      try {
        const rows = await loadJournalHybrid(userId);
        if (alive) setJournalEntries(rows);
      } catch {
        if (alive) setJournalEntries(loadJournalEntries());
      }
    }
    pull();
    const onEvt = () => {
      pull();
    };
    window.addEventListener('tos-journal-changed', onEvt);
    window.addEventListener('focus', onEvt);
    return () => {
      alive = false;
      window.removeEventListener('tos-journal-changed', onEvt);
      window.removeEventListener('focus', onEvt);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setAccountSummary(null);
      setWatchlist([]);
      setPositions([]);
      setDashboard(null);
      setAccountLoadState('idle');
      setAccountError(null);
      return;
    }
    let alive = true;
    setAccountLoadState('loading');
    setAccountError(null);
    (async () => {
      try {
        const [sum, wl, pos] = await Promise.all([
          adapter.getAccountSummary(userId),
          adapter.getWatchlist(userId),
          adapter.getOpenPositions(userId),
        ]);
        if (!alive) return;
        setAccountSummary(sum);
        setWatchlist(wl);
        setPositions(pos);
        setAccountLoadState('ok');
        try {
          const d = await adapter.getDashboard();
          if (alive) setDashboard(d);
        } catch {
          if (alive) setDashboard(null);
        }
      } catch (e) {
        if (!alive) return;
        setAccountLoadState('error');
        setAccountError(e instanceof Error ? e.message : String(e));
        setAccountSummary(null);
        setWatchlist([]);
        setPositions([]);
        setDashboard(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [adapter, userId]);

  useEffect(() => {
    if (!userId) {
      setBrokerAnalytics(null);
      setMonthDailyPnl({});
      setMonthPerf({ highest: null, lowest: null, total: 0, pf: null });
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const prefs = await fetchWorkspacePreferences(userId).catch(() => null);
        const accounts = await adapter.listBrokerAccounts(userId).catch(() => []);
        const prefAcct = prefs?.active_account_id ?? null;
        const active = prefAcct && accounts.some((a) => a.id === prefAcct) ? prefAcct : accounts[0]?.id ?? null;
        if (!active) {
          if (alive) setBrokerAnalytics(null);
          if (alive) {
            setMonthDailyPnl({});
            setMonthPerf({ highest: null, lowest: null, total: 0, pf: null });
          }
          return;
        }
        const [an, hist] = await Promise.all([
          adapter.getJournalAnalytics(userId, { accountId: active }),
          (async () => {
            const y = today.getFullYear();
            const m = today.getMonth();
            const from = new Date(Date.UTC(y, m, 1, 0, 0, 0)).toISOString();
            const to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59)).toISOString();
            return adapter.getTradeHistory(userId, { accountId: active, from, to, limit: 5000, label: 'all' });
          })(),
        ]);
        if (!alive) return;
        setBrokerAnalytics(an);
        const trades: BrokerTrade[] = hist.trades ?? [];
        const byDay: Record<number, number> = {};
        let total = 0;
        let grossProfit = 0;
        let grossLoss = 0;
        for (const t of trades) {
          const pnl = Number(t.pnl ?? 0) || 0;
          total += pnl;
          if (pnl > 0) grossProfit += pnl;
          if (pnl < 0) grossLoss += pnl;
          const when = t.closeTime ? new Date(t.closeTime) : null;
          if (!when || Number.isNaN(when.getTime())) continue;
          const day = when.getDate();
          byDay[day] = (byDay[day] ?? 0) + pnl;
        }
        const vals = Object.values(byDay);
        const highest = vals.length ? Math.max(...vals) : null;
        const lowest = vals.length ? Math.min(...vals) : null;
        const pf = grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : null;
        setMonthDailyPnl(byDay);
        setMonthPerf({ highest, lowest, total, pf: pf === Infinity ? null : pf });
      } catch {
        if (alive) setBrokerAnalytics(null);
        if (alive) {
          setMonthDailyPnl({});
          setMonthPerf({ highest: null, lowest: null, total: 0, pf: null });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [adapter, userId]);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    categories: true,
    accounts: true,
    wallets: true,
    stats: true,
    performance: true,
    journal: true,
    tools: true,
  });
  const [calcTab, setCalcTab] = useState('Risk : Reward');
  const [communityTab, setCommunityTab] = useState('Rooms');

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-3">
          <LayoutDashboard size={14} className="text-cyan-400" aria-hidden />
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">MAIN</span>
          <span className="font-mono text-[10px] text-white/45 tabular-nums">{symbol}</span>
        </div>
      </div>

      {!userId ? (
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-1.5 text-[10px] text-white/35">
          Sign in to load account, watchlist, and open positions via <span className="font-mono text-white/45">getTradingAdapter()</span>.
        </div>
      ) : accountLoadState === 'error' ? (
        <div className="border-b border-red-500/20 bg-red-500/5 px-4 py-1.5 text-[10px] text-red-200/90">
          {accountError}
        </div>
      ) : accountLoadState === 'loading' ? (
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-1.5 text-[10px] text-white/35">Loading account…</div>
      ) : accountSummary ? (
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-1.5 text-[10px] text-white/35">
          Live: <span className="font-mono text-white/45">getAccountSummary</span>,{' '}
          <span className="font-mono text-white/45">getWatchlist</span>,{' '}
          <span className="font-mono text-white/45">getOpenPositions</span>
          {dashboard ? (
            <>
              {' '}
              · <span className="font-mono text-white/45">getDashboard</span>{' '}
              {dashboard.overview.activeProviders}/{dashboard.overview.totalProviders} providers
            </>
          ) : null}
        </div>
      ) : null}

      {/* ===== DASHBOARD CONTENT ===== */}
      <div className="p-4 space-y-3">

        {/* ===== OVERVIEW ===== */}
        <div className="tos-card rounded-lg overflow-hidden">
          <div
            className="px-3 py-2 flex items-center justify-between border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
            onClick={() => toggleSection('overview')}
          >
            <div className="flex items-center gap-2">
              <span className="tos-block-title">OVERVIEW</span>
              <div className="w-3.5 h-3.5 rounded-full border border-white/20 flex items-center justify-center">
                <span className="text-[8px] text-white/40">?</span>
              </div>
            </div>
            <ChevronUp
              size={14}
              className={`text-white/40 transition-transform ${expandedSections.overview ? '' : 'rotate-180'}`}
            />
          </div>
          {expandedSections.overview && (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <LayoutDashboard size={16} className="text-cyan-400" />
                </div>
                <div>
                  <div className="text-sm font-medium">Good afternoon, {displayName}</div>
                  <div className="text-[10px] text-white/40">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · All
                    Accounts · {flatSymbols.length} workspace symbols
                    {userId ? ` · ${watchlist.length} engine watchlist` : ''} · {categoriesWithSymbols} active categories
                  </div>
                  {watchlist.length > 0 ? (
                    <div className="text-[9px] text-white/25 truncate" title={watchlist.map((w) => w.symbol).join(', ')}>
                      {watchlist
                        .slice(0, 6)
                        .map((w) => w.symbol)
                        .join(' · ')}
                      {watchlist.length > 6 ? ' · …' : ''}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="stat-box flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <DollarSign size={14} className="text-white/40" />
                  </div>
                  <div>
                    <div className="text-[9px] text-white/40 uppercase">TODAY&apos;S P&L</div>
                    <div className="text-sm font-semibold text-white/60">
                      {accountSummary ? fmtMoney(accountSummary.openPnl, accountSummary.currency) : EM}
                    </div>
                  </div>
                </div>
                <div className="stat-box flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <Activity size={14} className="text-white/40" />
                  </div>
                  <div>
                    <div className="text-[9px] text-white/40 uppercase">WIN RATE</div>
                    <div className="text-sm font-semibold text-white/60">{EM}</div>
                  </div>
                </div>
                <div className="stat-box flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <Briefcase size={14} className="text-white/40" />
                  </div>
                  <div>
                    <div className="text-[9px] text-white/40 uppercase">OPEN POSITIONS</div>
                    <div className="text-sm font-semibold text-white/60">{userId ? String(positions.length) : EM}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== CATEGORIES ===== */}
        <div className="rounded-lg overflow-hidden bg-gradient-to-b from-white/[0.03] to-transparent">
          <div
            className="px-3 py-2 flex items-center justify-between border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
            onClick={() => toggleSection('categories')}
          >
            <span className="tos-block-title">CATEGORIES</span>
            <ChevronUp
              size={14}
              className={`text-white/40 transition-transform ${expandedSections.categories ? '' : 'rotate-180'}`}
            />
          </div>
          {expandedSections.categories && (
            <div className="p-3">
              <div className="grid grid-cols-6 gap-3">
                {categoryTiles.map(({ key, ...tile }) => (
                  <CategoryTile key={key} {...tile} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ===== ACCOUNTS ===== */}
        <div className="tos-card rounded-lg overflow-hidden">
          <div
            className="px-3 py-2 flex items-center justify-between border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
            onClick={() => toggleSection('accounts')}
          >
            <div className="flex items-center gap-2">
              <Wallet size={12} className="text-white/50" />
              <span className="tos-block-title">ACCOUNTS</span>
              <span className="text-[10px] text-white/40">All Accounts</span>
              <ChevronDown size={10} className="text-white/40" />
            </div>
            <ChevronUp
              size={14}
              className={`text-white/40 transition-transform ${expandedSections.accounts ? '' : 'rotate-180'}`}
            />
          </div>
          {expandedSections.accounts && (
            <div className="p-3">
              <div className="grid grid-cols-2 gap-3">
                {/* Account */}
                <div className="rounded-lg border border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                    <span className="tos-block-title">ACCOUNT</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-white/10 rounded text-white/50">
                      {userId && accountSummary ? (
                        <span className="text-emerald-400/80">Live</span>
                      ) : (
                        'Paper Account'
                      )}
                    </span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_#22c55e]"></div>
                      <span className="text-xs font-medium">Paper Account</span>
                    </div>
                    <div className="space-y-1 pt-2">
                      {accountDetailRows.map((row) => (
                        <div key={row.label} className="flex justify-between text-[10px]">
                          <span className="text-white/40">{row.label}</span>
                          <span className={row.valClass || 'text-white/60'}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <button className="w-full btn-dark py-1.5 rounded text-[10px] flex items-center justify-center gap-1.5 mt-2">
                      <TrendingUp size={10} />
                      Reset paper account
                    </button>
                    <div className="text-center">
                      <span className="text-[10px] text-cyan-400 cursor-pointer hover:underline">Manage accounts</span>
                    </div>
                  </div>
                </div>
                {/* Positions */}
                <div className="rounded-lg border border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                    <span className="tos-block-title">POSITIONS</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded">Open</span>
                      <span className="text-[9px] px-1.5 py-0.5 text-white/40">History</span>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-white/40">Account:</span>
                      <span className="text-[10px] text-white/60">Paper Account</span>
                    </div>
                    {positions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-2">
                          <TrendingUp size={18} className="text-white/30" />
                        </div>
                        <div className="text-xs text-white/40">No open positions</div>
                        <div className="text-[10px] text-white/30 mt-1">Use the Execution Bridge to place paper trades</div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto custom-scrollbar">
                        {positions.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1.5"
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-[10px] font-medium text-white/70 truncate">{p.symbol}</span>
                              <span className="text-[9px] text-white/35">{p.direction.toUpperCase()} · {p.size}</span>
                            </div>
                            <div className="text-right shrink-0">
                              <div
                                className={`text-[10px] font-mono tabular-nums ${p.pnl >= 0 ? 'text-emerald-400/90' : 'text-red-400/90'}`}
                              >
                                {fmtMoney(p.pnl, accountSummary?.currency ?? 'USD')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== WALLETS ===== */}
        <div className="tos-card rounded-lg overflow-hidden">
          <div
            className="px-3 py-2 flex items-center justify-between border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
            onClick={() => toggleSection('wallets')}
          >
            <div className="flex items-center gap-2">
              <Wallet size={12} className="text-white/50" />
              <span className="tos-block-title">WALLETS</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="w-5 h-5 rounded bg-white/5 flex items-center justify-center hover:bg-white/10">
                <Plus size={10} />
              </button>
              <ChevronUp
                size={14}
                className={`text-white/40 transition-transform ${expandedSections.wallets ? '' : 'rotate-180'}`}
              />
            </div>
          </div>
          {expandedSections.wallets && (
            <div className="p-6 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-2">
                <Wallet size={18} className="text-white/30" />
              </div>
              <div className="text-sm text-white/60 mb-1">Track Wallet Balances</div>
              <div className="text-[11px] text-white/40 max-w-xs mb-3">
                Add any Ethereum, Bitcoin, or Solana address to track live on-chain balances.
              </div>
              <span className="text-xs text-cyan-400 cursor-pointer hover:underline">+ Add your first wallet</span>
            </div>
          )}
        </div>

        {/* ===== STATS ===== */}
        <div className="tos-card rounded-lg overflow-hidden">
          <div
            className="px-3 py-2 flex items-center justify-between border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
            onClick={() => toggleSection('stats')}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <BarChart3 size={12} className="text-white/50" />
                <span className="tos-block-title">STATS</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 bg-white/10 rounded text-white/50">Paper Account</span>
              <div className="flex items-center gap-1">
                {['Today', 'Week', 'Month', 'Custom'].map((tab) => (
                  <button
                    key={tab}
                    className={`px-2 py-0.5 rounded text-[9px] ${tab === 'Month' ? 'bg-cyan-500/20 text-cyan-400' : 'text-white/40 hover:text-white/60'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <button className="text-[9px] text-white/40 hover:text-white/60 flex items-center gap-0.5">
                All Symbols <ChevronDown size={8} />
              </button>
              <button className="text-[9px] text-white/40 hover:text-white/60 flex items-center gap-0.5">
                Manage <ChevronDown size={8} />
              </button>
            </div>
            <ChevronUp
              size={14}
              className={`text-white/40 transition-transform ${expandedSections.stats ? '' : 'rotate-180'}`}
            />
          </div>
          {expandedSections.stats && (
            <div className="p-4">
              <div className="grid grid-cols-6 gap-3">
                {statsRows.map((stat, i) => (
                  <div key={i} className="stat-box">
                    <div className="stat-label">{stat.label}</div>
                    <div className="stat-value">{stat.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-4 bg-gradient-to-b from-[#0d0d0d] to-[#080808] rounded-lg border border-white/5 shadow-inner">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">CONSISTENCY SCORE</span>
                  <span className="text-[10px] px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">Warning</span>
                </div>
                <div className="flex items-center gap-8">
                  <div className="relative w-16 h-16">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#eab308" strokeWidth="3" strokeDasharray="65, 100" className="drop-shadow-[0_0_4px_rgba(234,179,8,0.5)]" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-semibold text-white/60">/100</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    {[
                      ['Best trade', '\u2014'],
                      ['Worst trade', '\u2014'],
                      ['Max DD', '\u2014'],
                    ].map(([label, val], i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-white/50">{label}</span>
                        <span className="text-white/30">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== PERFORMANCE CALENDAR ===== */}
        <div className="tos-card rounded-lg overflow-hidden">
          <div
            className="px-3 py-2 flex items-center justify-between border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
            onClick={() => toggleSection('performance')}
          >
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-white/50" />
              <span className="tos-block-title">PERFORMANCE</span>
              <span className="text-[10px] text-white/40">Paper Account</span>
            </div>
            <ChevronUp
              size={14}
              className={`text-white/40 transition-transform ${expandedSections.performance ? '' : 'rotate-180'}`}
            />
          </div>
          {expandedSections.performance && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <button className="w-5 h-5 rounded bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                  <ChevronRight size={12} className="rotate-180" />
                </button>
                <span className="text-xs text-white/60 font-medium">
                  {today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button className="w-5 h-5 rounded bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                  <ChevronRight size={12} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <div key={i} className="text-[8px] text-white/25 text-center py-0.5">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day) => (
                  (() => {
                    const pnl = monthDailyPnl[day] ?? null;
                    const isToday = day === currentDay;
                    const bg =
                      pnl == null
                        ? 'bg-white/[0.03]'
                        : pnl > 0
                          ? 'bg-emerald-500/10'
                          : pnl < 0
                            ? 'bg-red-500/10'
                            : 'bg-white/[0.03]';
                    const border =
                      isToday
                        ? 'border-white/10'
                        : pnl == null
                          ? 'border-white/[0.06]'
                          : pnl > 0
                            ? 'border-emerald-500/20'
                            : pnl < 0
                              ? 'border-red-500/20'
                              : 'border-white/[0.06]';
                    const text =
                      isToday
                        ? 'text-white/70'
                        : pnl == null
                          ? 'text-white/45'
                          : pnl > 0
                            ? 'text-emerald-200/90'
                            : pnl < 0
                              ? 'text-red-200/90'
                              : 'text-white/55';
                    return (
                  <div
                    key={day}
                    className={`aspect-square w-full h-[44px] rounded-md flex items-center justify-center text-[12px] font-medium transition-all cursor-pointer border ${
                      `${bg} ${border} ${text} hover:bg-white/[0.06] hover:border-white/[0.1] hover:text-white/60`
                    }`}
                    title={pnl == null ? `Day ${day}` : `Day ${day} · P&L ${pnl.toFixed(2)}`}
                  >
                    {day}
                  </div>
                    );
                  })()
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3">
                {[
                  ['Highest', 'text-white/40'],
                  ['Lowest', 'text-white/40'],
                  ['Month P&L', 'text-white/40'],
                  ['PF', 'text-white/40'],
                ].map(([label, cls], i) => (
                  <div key={i} className="stat-box">
                    <div className="stat-label">{label}</div>
                    <div className={`stat-value ${cls}`}>
                      {label === 'Highest'
                        ? monthPerf.highest == null
                          ? '—'
                          : monthPerf.highest.toFixed(2)
                        : label === 'Lowest'
                          ? monthPerf.lowest == null
                            ? '—'
                            : monthPerf.lowest.toFixed(2)
                          : label === 'Month P&L'
                            ? monthPerf.total.toFixed(2)
                            : monthPerf.pf == null
                              ? '—'
                              : monthPerf.pf.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ===== JOURNAL ===== */}
        <div className="tos-card rounded-lg overflow-hidden">
          <div
            className="px-3 py-2 flex items-center justify-between border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
            onClick={() => toggleSection('journal')}
          >
            <div className="flex items-center gap-2">
              <BookOpen size={12} className="text-white/50" />
              <span className="tos-block-title">JOURNAL</span>
            </div>
            <ChevronUp
              size={14}
              className={`text-white/40 transition-transform ${expandedSections.journal ? '' : 'rotate-180'}`}
            />
          </div>
          {expandedSections.journal && (
            <div className="p-3">
              {/* Trade Journal Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="text-yellow-500/80" />
                  <span className="text-xs font-medium text-white/70">TRADE JOURNAL</span>
                </div>
                <div className="flex items-center gap-1">
                  <button className="w-5 h-5 rounded bg-white/5 flex items-center justify-center hover:bg-white/10">
                    <ChevronDown size={10} />
                  </button>
                  <button className="w-5 h-5 rounded bg-white/5 flex items-center justify-center hover:bg-white/10">
                    <X size={10} />
                  </button>
                </div>
              </div>
              {/* Completion Bar */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/40">COMPLETION</span>
                <span className="text-[10px] text-white/40">{journalSnap.completion}%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full mb-4">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, journalSnap.completion)}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {/* Trade List */}
                <div className="col-span-2 rounded-lg border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
                  <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-white/40">ENTRIES ({journalSnap.count})</span>
                    <Link to="/journal" className="text-[9px] text-cyan-400/90 hover:underline shrink-0">
                      Open workspace
                    </Link>
                  </div>
                  {journalEntries.length === 0 ? (
                    <div className="p-8 flex flex-col items-center justify-center text-center gap-2">
                      <div className="text-xs text-white/30">No journal entries yet</div>
                      <Link to="/journal" className="text-[10px] text-cyan-400/90 hover:underline">
                        Add notes &amp; entries
                      </Link>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1.5 max-h-[200px] overflow-y-auto scrollbar-hide">
                      {journalEntries.slice(0, 8).map((e) => (
                        <div
                          key={e.id}
                          className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-left"
                        >
                          <div className="text-[9px] font-mono text-white/35 flex flex-wrap gap-x-2 gap-y-0">
                            <span>{e.symbol}</span>
                            <span>{e.createdAt.slice(0, 10)}</span>
                            {e.rating ? <span className="text-cyan-400/80">{e.rating}</span> : null}
                          </div>
                          <div className="text-[10px] text-white/55 line-clamp-2 mt-0.5">{e.notes}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Journal Analytics */}
                <div className="space-y-2">
                  <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">JOURNAL ANALYTICS</div>
                  {[
                    {
                      icon: <span className="text-[8px] text-green-400">#</span>,
                      bg: 'bg-green-500/20',
                      label: 'TOP TAG (ALL TIME)',
                      val: journalSnap.topTag ?? EM,
                      cls: journalSnap.topTag ? 'text-green-400' : 'text-white/30',
                    },
                    {
                      icon: <span className="text-[8px] text-red-400">!</span>,
                      bg: 'bg-red-500/20',
                      label: 'MOST COMMON LOSING TAG',
                      val: EM,
                      cls: 'text-white/30',
                    },
                    {
                      icon: <TrendingUp size={12} className="text-cyan-400" />,
                      bg: '',
                      label: 'BEST-PERFORMING TAG',
                      val: EM,
                      cls: 'text-white/30',
                    },
                    {
                      icon: <Zap size={12} className="text-yellow-400" />,
                      bg: '',
                      label: 'AVG PNL WHEN \u2018IMPATIENT\u2019',
                      val: EM,
                      cls: 'text-white/30',
                    },
                    {
                      icon: <CircleDot size={12} className="text-red-400" />,
                      bg: '',
                      label: 'CONSISTENCY SCORE',
                      val: `${journalSnap.completion}%`,
                      cls: journalSnap.completion >= 50 ? 'text-emerald-400' : 'text-amber-400/90',
                    },
                    {
                      icon: <BarChart3 size={12} className="text-white/40" />,
                      bg: '',
                      label: 'TAG DISTRIBUTION',
                      val: '',
                      cls: '',
                    },
                  ].map((item, i) => (
                    <div key={i} className="p-3 rounded-lg border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
                      <div className="flex items-center gap-2 mb-1">
                        {item.bg ? (
                          <div className={`w-4 h-4 rounded-full ${item.bg} flex items-center justify-center`}>
                            {item.icon}
                          </div>
                        ) : (
                          item.icon
                        )}
                        <span className="text-[9px] text-white/40">{item.label}</span>
                      </div>
                      {item.val !== '' && item.val !== undefined ? (
                        <div className={`text-sm font-semibold ${item.cls}`}>{item.val}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== TOOLS ===== */}
        <div className="tos-card rounded-lg overflow-hidden">
          <div
            className="px-3 py-2 flex items-center justify-between border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
            onClick={() => toggleSection('tools')}
          >
            <div className="flex items-center gap-2">
              <Wrench size={12} className="text-white/50" />
              <span className="tos-block-title">TOOLS</span>
              <span className="text-[10px] text-white/40">Execution & analysis</span>
              <ChevronDown size={10} className="text-white/40" />
            </div>
            <ChevronUp
              size={14}
              className={`text-white/40 transition-transform ${expandedSections.tools ? '' : 'rotate-180'}`}
            />
          </div>
          {expandedSections.tools && (
            <div className="p-3 space-y-3">
              {/* Calculators & Podcasts */}
              <div className="grid grid-cols-2 gap-3">
                {/* Calculators */}
                <div className="rounded-lg border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent p-3">
                  <div className="text-[10px] text-white/50 uppercase tracking-wider mb-3">CALCULATORS</div>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {['Risk : Reward', 'Position Size', 'Pip Value', 'Lot Size', 'Margin', 'Compound'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setCalcTab(tab)}
                        className={`px-2 py-1 rounded text-[9px] transition-colors ${
                          calcTab === tab
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'text-white/40 hover:text-white/60'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  {/* Input Fields */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {['ENTRY', 'STOP LOSS', 'TAKE PROFIT'].map((label) => (
                      <div key={label}>
                        <div className="text-[9px] text-white/40 mb-1">{label}</div>
                        <input
                          type="text"
                          defaultValue="0"
                          readOnly
                          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/60 focus:outline-none focus:border-cyan-500/50"
                        />
                      </div>
                    ))}
                  </div>
                  {/* Output Fields */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      ['RISK', '\u2014', 'text-red-400'],
                      ['REWARD', '\u2014', 'text-green-400'],
                      ['R:R', '\u2014', 'text-cyan-400'],
                      ['BREAKEVEN', '\u2014', 'text-white/60'],
                    ].map(([label, val, cls]) => (
                      <div key={label} className="p-2 rounded bg-white/[0.03] border border-white/5">
                        <div className="text-[8px] text-white/40 mb-1">{label}</div>
                        <div className={`text-xs ${cls}`}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Podcasts */}
                <div className="rounded-lg border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Headphones size={12} className="text-white/50" />
                      <span className="text-[10px] text-white/50 uppercase tracking-wider">PODCASTS</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full border border-white/20 flex items-center justify-center">
                        <span className="text-[6px] text-white/40">?</span>
                      </div>
                      <span className="text-[9px] text-white/40">PODCASTS</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {['Chat With Traders', 'The Trading Coach', 'Desire To Trade', 'Top Traders Unplugged'].map((podcast) => (
                      <button
                        key={podcast}
                        className="px-2 py-1 rounded text-[9px] bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                      >
                        {podcast}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="text-sm text-white/60 mb-1">Page not available</div>
                    <div className="text-[10px] text-white/40 mb-3">Something went wrong, please try again later.</div>
                    <button className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-medium hover:bg-white/90 transition-colors">
                      Home
                    </button>
                  </div>
                  <div className="text-center mt-2">
                    <span className="text-[9px] text-white/30">Connect Spotify in integrations for your own shows</span>
                  </div>
                </div>
              </div>
              {/* Community */}
              <div className="rounded-lg border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Users size={12} className="text-white/50" />
                    <span className="text-[10px] text-white/50 uppercase tracking-wider">COMMUNITY</span>
                    <div className="w-3.5 h-3.5 rounded-full border border-white/20 flex items-center justify-center">
                      <span className="text-[8px] text-white/40">?</span>
                    </div>
                  </div>
                  <button className="w-5 h-5 rounded bg-white/5 flex items-center justify-center hover:bg-white/10">
                    <X size={10} />
                  </button>
                </div>
                <div className="flex gap-1">
                  {[
                    { id: 'Rooms', icon: Hash },
                    { id: 'Messages', icon: MessageSquare },
                    { id: 'Members', icon: UserPlus },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setCommunityTab(tab.id)}
                      className={`px-3 py-1.5 rounded text-[10px] flex items-center gap-1.5 transition-colors ${
                        communityTab === tab.id
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'text-white/40 hover:text-white/60'
                      }`}
                    >
                      <tab.icon size={10} />
                      {tab.id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== COOKIE NOTICE ===== */}
      <div className="bg-gradient-to-t from-[#0a0a0a] to-[#0d0d0d] border-t border-white/5 p-2 flex items-center justify-between">
        <p className="text-[10px] text-white/40">
          We use functional cookies only (e.g. preferences, session). No marketing cookies. By continuing you accept this notice.
        </p>
        <button className="text-[10px] text-white/60 hover:text-white flex items-center gap-1">
          <span>Dismiss</span>
          <X size={10} />
        </button>
      </div>
    </div>
  );
}
