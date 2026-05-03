/**
 * Consistent narrative for marketing screenshots — ES/NQ, CPI week, Mar 2026.
 * Same “operator” across all frames so the homepage feels like one real product.
 */
export const marketingOperator = {
  label: "Primary book",
  timezone: "ET",
  primarySymbols: ["ES M6", "NQ M6"] as const,
};

export const marketingOverview = {
  alignment: 82,
  alignmentDelta: "+3 pts",
  pendingApprovals: 2,
  vaultItems: 24,
  unreadAlerts: 3,
  terminalStatus: "Connected",
  workspaceId: "ws_alpha_7f2",
  lastSync: "Mar 29 · 06:30 UTC",
  headline: "London context clean · NY opens in 2h 14m",
  equityCurveCaption: "30-day paper · risk flat after CPI",
};

export const marketingPerformance = {
  alignment: 82,
  alignmentDelta: 3,
  keptRate: 71,
  setupsReviewed: 38,
  avgR30d: 0.38,
  maxDd30dPct: -1.2,
  sharpeLike: 0.94,
  weekLabels: ["Mar 3", "Mar 10", "Mar 17", "Mar 24"],
  weeklyR: [0.6, 0.2, -0.4, 0.45],
  note: "Paper book · sizing matches your 0.5% cap",
};

export const marketingChat = {
  pinned:
    "ES M6 · 5984–5992 defense band · invalidation: 5m close below 5980.50",
  messages: [
    {
      role: "assistant" as const,
      time: "06:18",
      body: "Overnight inventory balanced. I’m not proposing size into the band — wait for acceptance above 5992.25 or a clean sweep + reclaim.",
    },
    {
      role: "user" as const,
      time: "06:21",
      body: "If we reclaim, target still 6012 HVN?",
    },
    {
      role: "assistant" as const,
      time: "06:22",
      body: "Yes — partial 6004, runner to 6012 per your ladder rule. Execution stays pending until you confirm in Actions.",
    },
  ],
};

export const marketingAlerts = [
  {
    id: "a1",
    type: "Price",
    tone: "neutral" as const,
    title: "ES · 5988.50 touched",
    body: "Terminal: liquidity sweep at prior VAH. Observation only — no auto execution.",
    time: "06:05",
    unread: true,
  },
  {
    id: "a2",
    type: "Risk",
    tone: "risk" as const,
    title: "Daily budget · 41% used",
    body: "TradingOS pacing intact. Assistant will not propose size-ups today.",
    time: "05:40",
    unread: true,
  },
  {
    id: "a3",
    type: "News",
    tone: "news" as const,
    title: "Calendar · ECB speakers",
    body: "Low impact 08:30–09:00 UTC. Volatility flag lowered in workspace.",
    time: "Yesterday",
    unread: false,
  },
];

export const marketingVault = {
  notes: [
    {
      title: "NY open checklist",
      body: "No new swing into CPI impulse unless A+ reclaim + 5m close.",
      symbol: "ES",
      tag: "routine",
    },
    {
      title: "Invalidation language",
      body: "Wick through level ≠ exit. Need body close vs 5980.50.",
      symbol: "ES",
      tag: "rules",
    },
  ],
  screenshots: [
    { label: "ES · 15m context", symbol: "ES" },
    { label: "Depth · 5986", symbol: "ES" },
    { label: "NQ · OR bands", symbol: "NQ" },
  ],
};
