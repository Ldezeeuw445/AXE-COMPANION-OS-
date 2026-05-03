import type {
  AlertItem,
  ChatMessage,
  ConversationSummary,
  ExecutionRequestCard,
  LearningMetricPreview,
  MemoryEntryPreview,
  SetupReviewCard,
  VaultMediaItem,
  VaultNote,
} from "@/types/domain";

export const mockConversation: ConversationSummary = {
  id: "conv_primary",
  title: "Direct channel",
  pinnedContext:
    "ES futures · London open bias · Risk 0.5R max until NY confirmation.",
  lastMessageAt: new Date().toISOString(),
};

export const mockMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "Morning context loaded. Terminal shows balanced overnight inventory; I'm watching 5984–5992 for acceptance or rejection before sizing.",
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "m2",
    role: "user",
    content: "If we break 5992 with volume, what's the invalidation?",
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
  },
  {
    id: "m3",
    role: "assistant",
    content:
      "Clean invalidation below 5980.5 on a 5m close. Until then, treat 5984 as support shelf — no chase into the mid.",
    createdAt: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
    actionCard: {
      kind: "execution_preview",
      title: "Prepared idea — requires your approval",
      lines: [
        { label: "Instrument", value: "ES Jun" },
        { label: "Direction", value: "Long" },
        { label: "Entry", value: "5990.25 limit" },
        { label: "Stop", value: "5980.50" },
        { label: "Target", value: "6012.00" },
        { label: "Risk", value: "0.5% account" },
      ],
      executionRequestId: "exr_pending_1",
    },
  },
];

export const mockAlerts: AlertItem[] = [
  {
    id: "a1",
    type: "price",
    title: "ES · 5988 touched",
    body: "Terminal: liquidity sweep at prior VAH. No execution — observation only.",
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    relatedRefType: "vault_item",
    relatedRefId: "v_chart_1",
  },
  {
    id: "a2",
    type: "news",
    title: "Macro · ECB speakers",
    body: "Low impact window 08:30–09:00 UTC. Volatility flag lowered in terminal.",
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
  },
  {
    id: "a3",
    type: "risk",
    title: "Daily loss limit — 40% used",
    body: "TradingOS: pacing intact. Assistant will not propose size-ups today.",
    read: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
];

export const mockVaultNotes: VaultNote[] = [
  {
    id: "n1",
    title: "NY open checklist",
    body: "1) Confirm DXY reaction\n2) ES value area from ON\n3) No trades first 15m unless A+",
    tags: ["routine", "ES"],
    symbol: "ES",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  },
  {
    id: "n2",
    title: "Mental note — patience",
    body: "Missed trade > bad trade. Wait for terminal sync green.",
    tags: ["discipline"],
    symbol: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
  },
];

export const mockVaultMedia: VaultMediaItem[] = [
  {
    id: "v_chart_1",
    type: "chart_image",
    title: "ES · 15m context",
    symbol: "ES",
    tags: ["setup", "screenshot"],
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    thumbHint: "Gradient placeholder",
  },
  {
    id: "v_shot_2",
    type: "screenshot",
    title: "Depth ladder · 5986",
    symbol: "ES",
    tags: ["orderflow"],
    createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
  },
  {
    id: "v_voice_1",
    type: "voice",
    title: "Voice memo · commute",
    symbol: null,
    tags: ["voice"],
    createdAt: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
  },
];

export const mockExecutionCards: ExecutionRequestCard[] = [
  {
    id: "exr_pending_1",
    instrument: "ES Jun",
    direction: "long",
    entry: 5990.25,
    stopLoss: 5980.5,
    takeProfit: 6012,
    riskPercent: 0.5,
    rationale:
      "Long continuation after defended 5984 shelf; target prior HVN at 6012.",
    status: "pending_approval",
    warnings: ["News window in 25m — consider halving size."],
  },
  {
    id: "exr_draft_2",
    instrument: "NQ Jun",
    direction: "short",
    entry: 21480,
    stopLoss: 21540,
    takeProfit: 21320,
    riskPercent: 0.35,
    rationale: "Fade into overnight gap — draft only, needs LVN confirmation.",
    status: "draft",
  },
];

export const mockSetupReviews: SetupReviewCard[] = [
  {
    id: "sr1",
    instrument: "CL",
    direction: "long",
    summary: "Breakout vs 72.40 with inventory tailwind; terminal flags medium confidence.",
    status: "in_review",
  },
];

export const mockMemory: MemoryEntryPreview[] = [
  {
    id: "mem1",
    scope: "preferences",
    key: "preferred_sessions",
    excerpt: "London open precision, NY open size only after 09:45 ET.",
  },
  {
    id: "mem2",
    scope: "risk",
    key: "risk_behavior",
    excerpt: "User consistently reduces size after 2 consecutive losses — mirror in proposals.",
  },
];

export const mockLearningMetrics: LearningMetricPreview[] = [
  {
    metricKey: "alignment_score",
    label: "Alignment",
    value: 0.82,
    trend: "up",
  },
  {
    metricKey: "approved_setup_rate",
    label: "Approved setups",
    value: 0.64,
    trend: "flat",
  },
  {
    metricKey: "correction_rate",
    label: "Corrections / week",
    value: 3,
    trend: "down",
  },
];
