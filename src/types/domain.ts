export type MessageRole = "user" | "assistant" | "system";

export type VaultItemType =
  | "screenshot"
  | "chart_image"
  | "file"
  | "voice"
  | "link";

export type ExecutionDirection = "long" | "short" | "flat";

export type ExecutionStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "cancelled"
  | "executed";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  /** Inline action card payload (execution preview, alert summary, etc.) */
  actionCard?: ActionCardPayload;
};

export type ActionCardPayload = {
  kind: "execution_preview" | "setup_review" | "alert_digest";
  title: string;
  lines: { label: string; value: string }[];
  executionRequestId?: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  pinnedContext: string;
  lastMessageAt: string;
};

export type AlertItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
  relatedRefType?: string | null;
  relatedRefId?: string | null;
};

export type VaultNote = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  symbol: string | null;
  createdAt: string;
};

export type VaultMediaItem = {
  id: string;
  type: VaultItemType;
  title: string;
  symbol: string | null;
  tags: string[];
  createdAt: string;
  thumbHint?: string;
};

export type ExecutionRequestCard = {
  id: string;
  instrument: string;
  direction: ExecutionDirection;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskPercent: number | null;
  rationale: string;
  status: ExecutionStatus;
  warnings?: string[];
};

export type SetupReviewCard = {
  id: string;
  instrument: string;
  direction: ExecutionDirection | null;
  summary: string;
  status: "pending" | "in_review" | "approved" | "rejected";
};

export type LearningMetricPreview = {
  metricKey: string;
  label: string;
  value: number;
  trend?: "up" | "down" | "flat";
};

export type MemoryEntryPreview = {
  id: string;
  scope: string;
  key: string | null;
  excerpt: string;
};
