"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  Bell,
  Bookmark,
  BookOpen,
  Brain,
  ClipboardList,
  Coins,
  LineChart,
  MessageSquare,
  Newspaper,
  ScanLine,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";

type WorkflowStatus =
  | "ready"
  | "needs_account"
  | "needs_positions"
  | "needs_market"
  | "needs_journal"
  | "needs_memory"
  | "warming"
  | "soon";

type WorkflowAction = {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  href: string;
  status: WorkflowStatus;
};

type WorkflowCategory = {
  id: string;
  title: string;
  subtitle: string;
  actions: WorkflowAction[];
};

type Props = {
  hasActiveAccount: boolean;
  hasOpenPositions?: boolean;
  hasTradeHistory?: boolean;
  hasJournal?: boolean;
  hasMemory?: boolean;
  /** Any headline news provider configured (Perigon / Finnhub / EODHD). */
  hasNews?: boolean;
  /** FRED — or any news provider — configured for macro context. */
  hasMacro?: boolean;
};

function chatQ(text: string): string {
  return `/chat?q=${encodeURIComponent(text)}`;
}

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  ready: "Ready",
  needs_account: "Needs MT5",
  needs_positions: "Needs positions",
  needs_market: "Needs market context",
  needs_journal: "Needs journal",
  needs_memory: "Needs memory",
  warming: "Warming",
  soon: "Coming soon",
};

const STATUS_CLASS: Record<WorkflowStatus, string> = {
  ready: "border-white/[0.10] text-white/90 bg-white/[0.05]",
  needs_account: "border-amber-400/25 text-amber-200/90 bg-amber-400/[0.06]",
  needs_positions: "border-amber-400/25 text-amber-200/90 bg-amber-400/[0.06]",
  needs_market: "border-amber-400/25 text-amber-200/90 bg-amber-400/[0.06]",
  needs_journal: "border-amber-400/25 text-amber-200/90 bg-amber-400/[0.06]",
  needs_memory: "border-amber-400/25 text-amber-200/90 bg-amber-400/[0.06]",
  warming: "border-white/12 text-tos-dim bg-white/[0.03]",
  soon: "border-white/12 text-tos-dim bg-white/[0.03]",
};

export function AxeWorkflowsHub({
  hasActiveAccount,
  hasOpenPositions = false,
  hasTradeHistory = false,
  hasJournal = false,
  hasMemory = false,
  hasNews = false,
  hasMacro = false,
}: Props) {
  const acctState: WorkflowStatus = hasActiveAccount ? "ready" : "needs_account";
  const positionsState: WorkflowStatus = hasActiveAccount ? (hasOpenPositions ? "ready" : "needs_positions") : "needs_account";
  const historyState: WorkflowStatus = hasActiveAccount ? (hasTradeHistory ? "ready" : "warming") : "needs_account";
  const journalState: WorkflowStatus = hasJournal || hasTradeHistory ? "ready" : "needs_journal";
  const memoryState: WorkflowStatus = hasMemory ? "ready" : "needs_memory";
  const newsState: WorkflowStatus = hasNews ? "ready" : "needs_market";
  const macroState: WorkflowStatus = hasMacro ? "ready" : "needs_market";

  const categories: WorkflowCategory[] = [
    {
      id: "market",
      title: "Market",
      subtitle: "Macro & news context filtered by your active pair.",
      actions: [
        {
          id: "next-news",
          title: "Show next high-impact news",
          description: "What matters next on USD / your active pair",
          icon: <Newspaper className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · market]\nUsing my active pair and watchlist, what high-impact news prints are next? Mention CPI/NFP/FOMC and what they mean for my exposure.",
          ),
          status: newsState,
        },
        {
          id: "macro-risk",
          title: "Explain today’s macro risk",
          description: "Rates, yields, DXY, gold/USD axis",
          icon: <ScanLine className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · macro]\nWalk me through today's macro risk: rates, yields, DXY proxy and gold/USD axis. Anchor it on my active pair.",
          ),
          status: macroState,
        },
        {
          id: "xau-bias",
          title: "What matters for XAUUSD today?",
          description: "Bias drivers anchored to my active account",
          icon: <Coins className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · XAUUSD]\nGive me a focused brief on XAUUSD today: bias drivers, key levels and what would change your view.",
          ),
          status: hasMacro || hasNews ? "ready" : "needs_market",
        },
        {
          id: "sentiment",
          title: "Summarize market sentiment",
          description: "Risk-on/off snapshot for my watchlist",
          icon: <Sparkles className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · sentiment]\nSummarize current market sentiment (risk-on / risk-off) for my watchlist. Keep it tight: 5 lines.",
          ),
          status: newsState,
        },
      ],
    },
    {
      id: "positions",
      title: "Positions",
      subtitle: "Risk-aware checks on what is open right now.",
      actions: [
        {
          id: "risk-check",
          title: "Risk check open positions",
          description: "Distance to SL/TP, RR, what needs attention",
          icon: <ClipboardList className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · risk]\nRisk-check my open MT5 positions — distance to SL/TP, RR and what needs attention.",
          ),
          status: positionsState,
        },
        {
          id: "exposure",
          title: "Explain my current exposure",
          description: "By currency, by symbol, correlated risks",
          icon: <Activity className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · exposure]\nExplain my current exposure: by currency, by symbol, and any correlated risks I should watch.",
          ),
          status: positionsState,
        },
        {
          id: "near-sltp",
          title: "Show positions near SL/TP",
          description: "Which trades are closest to a decision",
          icon: <Target className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · near-sl-tp]\nWhich of my open positions are closest to SL/TP and need a decision now?",
          ),
          status: positionsState,
        },
        {
          id: "drawdown",
          title: "Check floating drawdown",
          description: "Current floating P/L and risk budget",
          icon: <LineChart className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · drawdown]\nCheck my floating drawdown and what % of risk budget that represents on my active account.",
          ),
          status: positionsState,
        },
      ],
    },
    {
      id: "journal",
      title: "Journal",
      subtitle: "Learn from your own trades — AXE reads context.",
      actions: [
        {
          id: "today",
          title: "Review today’s trades",
          description: "What worked, what to fix, what to journal",
          icon: <BookOpen className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · journal · today]\nReview my trades from today: what worked, what to fix, and what I should journal.",
          ),
          status: historyState,
        },
        {
          id: "biggest-mistake",
          title: "Find my biggest mistake this week",
          description: "Pattern hunting across your last 7 days",
          icon: <ClipboardList className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · journal · week]\nFind my biggest mistake this week and propose one specific rule to prevent it.",
          ),
          status: journalState,
        },
        {
          id: "weekly",
          title: "Create weekly review",
          description: "Trades, behaviour, rule alignment",
          icon: <Sparkles className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · journal · weekly review]\nCreate a structured weekly review: stats, behaviour patterns, rule alignment, and 3 concrete adjustments.",
          ),
          status: journalState,
        },
      ],
    },
    {
      id: "account",
      title: "Account",
      subtitle: "Funded-account aware health checks.",
      actions: [
        {
          id: "health",
          title: "Show account health",
          description: "Equity, margin, daily/total loss buffer",
          icon: <Wallet className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · account · health]\nShow me my account health: equity, margin, daily/total loss buffer and any funded-account rules I am close to.",
          ),
          status: historyState,
        },
        {
          id: "today-pnl",
          title: "Show today’s P/L",
          description: "Realised + floating",
          icon: <LineChart className="h-3.5 w-3.5" />,
          href: chatQ("[AXE · pnl · today]\nShow my realised + floating P/L for today on the active account."),
          status: historyState,
        },
        {
          id: "consistency",
          title: "Funded-account consistency check",
          description: "Risk-per-trade, daily distribution, drift",
          icon: <ClipboardList className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · consistency]\nCheck my funded-account consistency: risk per trade, daily distribution, and any drift from my plan.",
          ),
          status: positionsState,
        },
      ],
    },
    {
      id: "alerts",
      title: "Alerts",
      subtitle: "Create alerts using broker price.",
      actions: [
        {
          id: "price-alert",
          title: "Create price alert",
          description: "Price above/below on broker symbol",
          icon: <Bell className="h-3.5 w-3.5" />,
          href: "/alerts",
          status: acctState,
        },
        {
          id: "news-alert",
          title: "Create news alert",
          description: "High-impact news for active pair",
          icon: <Newspaper className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · alert · news]\nDraft an alert rule for the next high-impact news event affecting my active pair. I'll save it to /alerts.",
          ),
          status: newsState,
        },
        {
          id: "loss-alert",
          title: "Alert when open loss exceeds threshold",
          description: "Floating loss guard for open positions",
          icon: <Activity className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · alert · loss]\nDraft a floating-loss alert: trigger when total open loss exceeds my chosen threshold on the active account.",
          ),
          status: acctState,
        },
      ],
    },
    {
      id: "memory",
      title: "AXE memory",
      subtitle: "Keep AXE calibrated to how you actually trade.",
      actions: [
        {
          id: "save-rule",
          title: "Save this as a rule",
          description: "Use the most recent insight as a binding rule",
          icon: <Bookmark className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · memory · save rule]\nSave the most recent insight from our chat as a binding trading rule in my AXE memory. Confirm before saving.",
          ),
          status: memoryState,
        },
        {
          id: "playbook",
          title: "Update my playbook",
          description: "Refine setup checklist & invalidations",
          icon: <Brain className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · memory · playbook]\nUpdate my playbook based on what we just discussed: setups, invalidations, and what triggers a no-trade day.",
          ),
          status: memoryState,
        },
        {
          id: "mistake",
          title: "Mark this as a mistake",
          description: "Record a mistake pattern in AXE memory",
          icon: <ClipboardList className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · memory · mistake]\nMark the most recent decision we discussed as a mistake pattern, with the trigger and the rule that should prevent it next time.",
          ),
          status: memoryState,
        },
      ],
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
            AXE Quick workflows
          </p>
          <p className="mt-0.5 text-xs text-tos-muted">
            One-tap intelligence — execution stays disabled by default.
          </p>
        </div>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-tos-muted hover:border-white/[0.12] hover:text-tos-text"
        >
          <MessageSquare className="h-3 w-3" />
          Open Chat
        </Link>
      </div>

      <div className="space-y-5">
        {categories.map((cat) => (
          <div key={cat.id}>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">{cat.title}</h3>
              <span className="text-[10.5px] text-tos-dim/85">{cat.subtitle}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {cat.actions.map((a) => (
                <ActionTile key={a.id} action={a} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionTile({ action }: { action: WorkflowAction }) {
  const blocked = action.status !== "ready";
  return (
    <Link
      href={action.href}
      className={`group flex flex-col gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.05]`}
      prefetch={false}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-[#0e0f12]/95 text-white/60">
          {action.icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-tos-text">{action.title}</span>
      </div>
      <p className="line-clamp-2 text-[10.5px] text-tos-muted">{action.description}</p>
      <div className="mt-1 flex items-center justify-between">
        <span
          className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${STATUS_CLASS[action.status]}`}
        >
          {STATUS_LABEL[action.status]}
        </span>
        {blocked ? null : <span className="text-[9px] text-tos-dim/80 group-hover:text-white/60">Run →</span>}
      </div>
    </Link>
  );
}
