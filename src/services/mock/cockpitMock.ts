import type { CockpitDashboard } from "@/types/cockpit";

/**
 * Mock cockpit — one coherent story: ES/NQ operator, London scout / NY size,
 * CPI week confidence dip, invalidation corrections, sweep→reclaim edge.
 */
export const mockCockpitDashboard: CockpitDashboard = {
  snapshotId: "snap_2026_03_29_0630z",
  shouldAutoRefresh: false,
  learningProgress: {
    headline:
      "After CPI week, the model leaned harder into how you define invalidation — fewer tick-scratch exits, more 5-minute closes. NY size-up only fires once London context is tagged “clean.”",
    milestones: [
      {
        id: "mp1",
        label: "Risk pacing after drawdowns",
        periodLabel: "Stabilized",
        progress: 100,
        narrative:
          "You rarely widen stops after two losses; proposals now step size down automatically instead of waiting for you to say it.",
      },
      {
        id: "mp2",
        label: "London vs New York roles",
        periodLabel: "Strong",
        progress: 88,
        narrative:
          "London is treated as recon and level defense; executable ideas tilt NY — matching when you actually lift offers.",
      },
      {
        id: "mp3",
        label: "Invalidation language",
        periodLabel: "Calibrating",
        progress: 62,
        narrative:
          "Fourteen corrections in four weeks were mostly “close vs wick” rules on ES. The assistant is halfway to your standard.",
      },
      {
        id: "mp4",
        label: "Macro-day throttle",
        periodLabel: "Early",
        progress: 28,
        narrative:
          "It now tags CPI/FOMC days before open; next step is honoring your “no new swing” flags without prompting.",
      },
    ],
  },
  alignment: {
    score: 82,
    capturedAt: "2026-03-29T06:30:00.000Z",
    deltaFromPrior: 3,
  },
  confidence: {
    headline:
      "Confidence dipped into the Mar 17–18 CPI window, recovered as your VAH/VAL plays printed, and sits a touch higher than pre-event — the model isn’t “more bullish”; it’s less wrong about your rules.",
    series: [
      { at: "2026-03-15T12:00:00.000Z", value: 0.63 },
      { at: "2026-03-16T12:00:00.000Z", value: 0.65 },
      { at: "2026-03-17T12:00:00.000Z", value: 0.57 },
      { at: "2026-03-18T12:00:00.000Z", value: 0.55 },
      { at: "2026-03-19T12:00:00.000Z", value: 0.6 },
      { at: "2026-03-22T12:00:00.000Z", value: 0.64 },
      { at: "2026-03-24T12:00:00.000Z", value: 0.67 },
      { at: "2026-03-27T12:00:00.000Z", value: 0.69 },
      { at: "2026-03-29T06:30:00.000Z", value: 0.72 },
    ],
  },
  feedback: {
    acceptedSetups: 27,
    rejectedSetups: 11,
    correctionsCount: 14,
    correctionLiftPercent: 4,
    last28dTrend: [
      { weekLabel: "Mar 3–9", corrections: 2 },
      { weekLabel: "Mar 10–16", corrections: 5 },
      { weekLabel: "Mar 17–23", corrections: 4 },
      { weekLabel: "Mar 24–30", corrections: 3 },
    ],
  },
  behavior: {
    sessions: [
      {
        id: "s1",
        label: "London",
        weight: 0.34,
        note: "Used for location and sweep tags; fewer “full size” labels than six weeks ago.",
      },
      {
        id: "s2",
        label: "New York",
        weight: 0.46,
        note: "Where most of your approved risk actually lands — assistant weights fills after 09:45 ET unless A+ reclaim.",
      },
      {
        id: "s3",
        label: "Asia",
        weight: 0.2,
        note: "Mostly overnight context for ES; ideas throttled unless you star a level in the vault.",
      },
    ],
    preferredAssets: [
      {
        symbol: "ES",
        weight: 0.46,
        context: "Primary book; value-area and VWAP language match your notes.",
      },
      {
        symbol: "NQ",
        weight: 0.28,
        context: "Smaller size, wider targets — assistant mirrors your “beta, not hero” rule.",
      },
      {
        symbol: "CL",
        weight: 0.14,
        context: "Inventory weeks only; pattern library from saved vault screenshots.",
      },
      {
        symbol: "GC",
        weight: 0.12,
        context: "Framed as macro hedge commentary, not intraday scalps.",
      },
    ],
    patternTendencies: [
      {
        id: "p1",
        label: "Liquidity sweep → reclaim (ES)",
        strength: 84,
      },
      {
        id: "p2",
        label: "HVN fade after single-print impulse",
        strength: 71,
      },
      {
        id: "p3",
        label: "Opening range breakout — delayed entry",
        strength: 59,
      },
    ],
  },
  metricKeysSample: [
    "alignment_score",
    "approved_setup_rate",
    "correction_rate",
    "confidence_mean_7d",
    "session_london_weight",
  ],
  calibration: {
    state: "active",
    signalCount: 64,
    missingSignals: [],
    lastCalculatedAt: "2026-03-29T06:30:00.000Z",
    message: "Mock dashboard only: real cockpit scores stay conservative until live user signals exist.",
  },
  today: {
    alignmentScore: 72,
    chatMessages: 4,
    tradesClosed: 1,
    feedEvents: 3,
    journalNotes: 1,
  },
  learningArc: {
    headline: "Mock arc: invalidation language and NY size discipline are your strongest teaching signals this month.",
    weeklyFocus: [
      { label: "Reasoning fixes", count: 14 },
      { label: "Trade alignment", count: 9 },
      { label: "Chat response quality", count: 6 },
    ],
    messageFeedback: { up: 11, down: 3 },
    weeklyFeedbackTrend: [
      { weekLabel: "3 Mar", up: 2, down: 1 },
      { weekLabel: "10 Mar", up: 3, down: 0 },
      { weekLabel: "17 Mar", up: 4, down: 1 },
      { weekLabel: "24 Mar", up: 2, down: 1 },
    ],
  },
  traderScores: {
    periodDays: 90,
    sampleSize: 64,
    tradeCount: 28,
    overallAlignment: 69,
    scores: [
      { key: "discipline", label: "Discipline", score: 68, available: true, hint: "Mock — emotional discipline from journal breakdowns." },
      { key: "execution", label: "Execution", score: 74, available: true, hint: "Mock — playbook + rule adherence." },
      { key: "risk", label: "Risk", score: 71, available: true, hint: "Mock — risk management dimension." },
      { key: "patience", label: "Patience", score: 62, available: true, hint: "Mock — label + frequency rollup." },
    ],
  },
};
