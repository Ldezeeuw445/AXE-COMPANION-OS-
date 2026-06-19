export type WorkflowStatus =
  | "ready"
  | "needs_account"
  | "needs_positions"
  | "needs_market"
  | "needs_journal"
  | "needs_memory"
  | "warming"
  | "soon";

export type WorkflowStatusGate =
  | "account"
  | "positions"
  | "history"
  | "journal"
  | "memory"
  | "news"
  | "macro"
  | "macro_or_news";

export type WorkflowIconKey =
  | "activity"
  | "bell"
  | "bookmark"
  | "book-open"
  | "brain"
  | "clipboard"
  | "coins"
  | "line-chart"
  | "newspaper"
  | "scan"
  | "sparkles"
  | "target"
  | "wallet";

export type WorkflowDefinition = {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  iconKey: WorkflowIconKey;
  /** Chat prompt — omit when `href` is set. */
  chatPrompt?: string;
  href?: string;
  statusGate: WorkflowStatusGate;
};

export type WorkflowCategoryDef = {
  id: string;
  title: string;
  subtitle: string;
};

export const WORKFLOW_CATEGORY_DEFS: WorkflowCategoryDef[] = [
  { id: "market", title: "Market", subtitle: "Macro & news context filtered by your active pair." },
  { id: "positions", title: "Positions", subtitle: "Risk-aware checks on what is open right now." },
  { id: "journal", title: "Journal", subtitle: "Learn from your own trades — AXE reads context." },
  { id: "account", title: "Account", subtitle: "Funded-account aware health checks." },
  { id: "alerts", title: "Alerts", subtitle: "Create alerts using broker price." },
  { id: "memory", title: "AXE memory", subtitle: "Keep AXE calibrated to how you actually trade." },
];

export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    id: "next-news",
    categoryId: "market",
    title: "Show next high-impact news",
    description: "What matters next on USD / your active pair",
    iconKey: "newspaper",
    chatPrompt:
      "[AXE · market]\nUsing my active pair and watchlist, what high-impact news prints are next? Mention CPI/NFP/FOMC and what they mean for my exposure.",
    statusGate: "news",
  },
  {
    id: "macro-risk",
    categoryId: "market",
    title: "Explain today’s macro risk",
    description: "Rates, yields, DXY, gold/USD axis",
    iconKey: "scan",
    chatPrompt:
      "[AXE · macro]\nWalk me through today's macro risk: rates, yields, DXY proxy and gold/USD axis. Anchor it on my active pair.",
    statusGate: "macro",
  },
  {
    id: "xau-bias",
    categoryId: "market",
    title: "What matters for XAUUSD today?",
    description: "Bias drivers anchored to my active account",
    iconKey: "coins",
    chatPrompt:
      "[AXE · XAUUSD]\nGive me a focused brief on XAUUSD today: bias drivers, key levels and what would change your view.",
    statusGate: "macro_or_news",
  },
  {
    id: "sentiment",
    categoryId: "market",
    title: "Summarize market sentiment",
    description: "Risk-on/off snapshot for my watchlist",
    iconKey: "sparkles",
    chatPrompt:
      "[AXE · sentiment]\nSummarize current market sentiment (risk-on / risk-off) for my watchlist. Keep it tight: 5 lines.",
    statusGate: "news",
  },
  {
    id: "risk-check",
    categoryId: "positions",
    title: "Risk check open positions",
    description: "Distance to SL/TP, RR, what needs attention",
    iconKey: "clipboard",
    chatPrompt:
      "[AXE · risk]\nRisk-check my open MT5 positions — distance to SL/TP, RR and what needs attention.",
    statusGate: "positions",
  },
  {
    id: "exposure",
    categoryId: "positions",
    title: "Explain my current exposure",
    description: "By currency, by symbol, correlated risks",
    iconKey: "activity",
    chatPrompt:
      "[AXE · exposure]\nExplain my current exposure: by currency, by symbol, and any correlated risks I should watch.",
    statusGate: "positions",
  },
  {
    id: "near-sltp",
    categoryId: "positions",
    title: "Show positions near SL/TP",
    description: "Which trades are closest to a decision",
    iconKey: "target",
    chatPrompt:
      "[AXE · near-sl-tp]\nWhich of my open positions are closest to SL/TP and need a decision now?",
    statusGate: "positions",
  },
  {
    id: "drawdown",
    categoryId: "positions",
    title: "Check floating drawdown",
    description: "Current floating P/L and risk budget",
    iconKey: "line-chart",
    chatPrompt:
      "[AXE · drawdown]\nCheck my floating drawdown and what % of risk budget that represents on my active account.",
    statusGate: "positions",
  },
  {
    id: "today",
    categoryId: "journal",
    title: "Review today’s trades",
    description: "What worked, what to fix, what to journal",
    iconKey: "book-open",
    chatPrompt:
      "[AXE · journal · today]\nReview my trades from today: what worked, what to fix, and what I should journal.",
    statusGate: "history",
  },
  {
    id: "biggest-mistake",
    categoryId: "journal",
    title: "Find my biggest mistake this week",
    description: "Pattern hunting across your last 7 days",
    iconKey: "clipboard",
    chatPrompt:
      "[AXE · journal · week]\nFind my biggest mistake this week and propose one specific rule to prevent it.",
    statusGate: "journal",
  },
  {
    id: "weekly",
    categoryId: "journal",
    title: "Create weekly review",
    description: "Trades, behaviour, rule alignment",
    iconKey: "sparkles",
    chatPrompt:
      "[AXE · journal · weekly review]\nCreate a structured weekly review: stats, behaviour patterns, rule alignment, and 3 concrete adjustments.",
    statusGate: "journal",
  },
  {
    id: "health",
    categoryId: "account",
    title: "Show account health",
    description: "Equity, margin, daily/total loss buffer",
    iconKey: "wallet",
    chatPrompt:
      "[AXE · account · health]\nShow me my account health: equity, margin, daily/total loss buffer and any funded-account rules I am close to.",
    statusGate: "history",
  },
  {
    id: "today-pnl",
    categoryId: "account",
    title: "Show today’s P/L",
    description: "Realised + floating",
    iconKey: "line-chart",
    chatPrompt: "[AXE · pnl · today]\nShow my realised + floating P/L for today on the active account.",
    statusGate: "history",
  },
  {
    id: "consistency",
    categoryId: "account",
    title: "Funded-account consistency check",
    description: "Risk-per-trade, daily distribution, drift",
    iconKey: "clipboard",
    chatPrompt:
      "[AXE · consistency]\nCheck my funded-account consistency: risk per trade, daily distribution, and any drift from my plan.",
    statusGate: "positions",
  },
  {
    id: "price-alert",
    categoryId: "alerts",
    title: "Create price alert",
    description: "Price above/below on broker symbol",
    iconKey: "bell",
    href: "/alerts",
    statusGate: "account",
  },
  {
    id: "news-alert",
    categoryId: "alerts",
    title: "Create news alert",
    description: "High-impact news for active pair",
    iconKey: "newspaper",
    chatPrompt:
      "[AXE · alert · news]\nDraft an alert rule for the next high-impact news event affecting my active pair. I'll save it to /alerts.",
    statusGate: "news",
  },
  {
    id: "loss-alert",
    categoryId: "alerts",
    title: "Alert when open loss exceeds threshold",
    description: "Floating loss guard for open positions",
    iconKey: "activity",
    chatPrompt:
      "[AXE · alert · loss]\nDraft a floating-loss alert: trigger when total open loss exceeds my chosen threshold on the active account.",
    statusGate: "account",
  },
  {
    id: "save-rule",
    categoryId: "memory",
    title: "Save this as a rule",
    description: "Use the most recent insight as a binding rule",
    iconKey: "bookmark",
    chatPrompt:
      "[AXE · memory · save rule]\nSave the most recent insight from our chat as a binding trading rule in my AXE memory. Confirm before saving.",
    statusGate: "memory",
  },
  {
    id: "playbook",
    categoryId: "memory",
    title: "Update my playbook",
    description: "Refine setup checklist & invalidations",
    iconKey: "brain",
    chatPrompt:
      "[AXE · memory · playbook]\nUpdate my playbook based on what we just discussed: setups, invalidations, and what triggers a no-trade day.",
    statusGate: "memory",
  },
  {
    id: "mistake",
    categoryId: "memory",
    title: "Mark this as a mistake",
    description: "Record a mistake pattern in AXE memory",
    iconKey: "clipboard",
    chatPrompt:
      "[AXE · memory · mistake]\nMark the most recent decision we discussed as a mistake pattern, with the trigger and the rule that should prevent it next time.",
    statusGate: "memory",
  },
];

export const WORKFLOW_IDS = WORKFLOW_DEFINITIONS.map((w) => w.id);

export function getWorkflowDefinition(id: string): WorkflowDefinition | undefined {
  return WORKFLOW_DEFINITIONS.find((w) => w.id === id);
}
