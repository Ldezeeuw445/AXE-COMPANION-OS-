/**
 * Shapes aligned with Supabase `assistant_cockpit_snapshots`,
 * `assistant_learning_metrics`, and `assistant_learning_signals`
 * for the Assistant Cockpit UI.
 */

export type CockpitLearningMilestone = {
  id: string;
  label: string;
  periodLabel: string;
  /** 0–100 completion toward this learning phase */
  progress: number;
  narrative: string;
};

/** Snapshot score: how well AXE fits *your* book (100 = fully aligned). Not the trader pillar rollup. */
export type CockpitAlignment = {
  /** 0–100 — mirrors `alignment_score` on snapshots */
  score: number;
  capturedAt: string;
  /** Change vs prior snapshot (+/- points) */
  deltaFromPrior: number;
};

export type CockpitConfidencePoint = {
  at: string;
  /** 0–1 model confidence aggregate */
  value: number;
};

export type CockpitFeedbackImpact = {
  acceptedSetups: number;
  rejectedSetups: number;
  correctionsCount: number;
  /** Narrative: estimated lift to alignment from corrections (mock %) */
  correctionLiftPercent: number;
  last28dTrend: { weekLabel: string; corrections: number }[];
};

export type CockpitBehaviorSession = {
  id: string;
  label: string;
  /** 0–1 share of attention / matched decisions */
  weight: number;
  note?: string;
};

export type CockpitPreferredAsset = {
  symbol: string;
  weight: number;
  context: string;
};

export type CockpitPatternTendency = {
  id: string;
  label: string;
  /** 0–100 strength */
  strength: number;
};

export type CockpitBehaviorMap = {
  sessions: CockpitBehaviorSession[];
  preferredAssets: CockpitPreferredAsset[];
  patternTendencies: CockpitPatternTendency[];
};

export type CockpitDashboard = {
  /** Mirrors `assistant_cockpit_snapshots.id` when live */
  snapshotId: string;
  /** True when new signals exist since last snapshot — triggers background recalibration */
  shouldAutoRefresh: boolean;
  learningProgress: {
    headline: string;
    milestones: CockpitLearningMilestone[];
  };
  alignment: CockpitAlignment;
  confidence: {
    headline: string;
    series: CockpitConfidencePoint[];
  };
  feedback: CockpitFeedbackImpact;
  behavior: CockpitBehaviorMap;
  /**
   * Sample metric keys present in `assistant_learning_metrics`;
   * replace with live rollup keys when fetching from DB.
   */
  metricKeysSample: string[];
  calibration: {
    state: "calibrating" | "insufficient_data" | "active";
    signalCount: number;
    missingSignals: string[];
    lastCalculatedAt: string | null;
    message: string;
  };
  today: CockpitTodaySummary;
  learningArc: CockpitLearningArc;
  traderScores: CockpitTraderScores;
};

export type CockpitTodaySummary = {
  chatMessages: number;
  tradesClosed: number;
  feedEvents: number;
  journalNotes: number;
};

export type CockpitLearningArc = {
  headline: string;
  weeklyFocus: { label: string; count: number }[];
  messageFeedback: { up: number; down: number };
  weeklyFeedbackTrend: { weekLabel: string; up: number; down: number }[];
};

export type CockpitTraderScoreKey =
  | "discipline"
  | "execution"
  | "risk"
  | "patience";

export type CockpitTraderScoreItem = {
  key: CockpitTraderScoreKey;
  label: string;
  score: number;
  available: boolean;
  hint: string;
};

export type CockpitTraderScores = {
  periodDays: number;
  sampleSize: number;
  tradeCount: number;
  /** Mean of available pillar scores (discipline, execution, risk, patience). Not AXE snapshot alignment. */
  traderOverallScore: number | null;
  scores: CockpitTraderScoreItem[];
};
