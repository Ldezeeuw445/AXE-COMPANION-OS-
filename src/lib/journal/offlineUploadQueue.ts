/**
 * Offline-tolerant journal upload queue.
 *
 * Persistence is a JSON array in localStorage (small metadata + base64 blobs
 * for files under the attachment cap). The flush loop is a no-op when
 * navigator.onLine is false; it retries when the browser fires `online`.
 */

export const JOURNAL_OFFLINE_QUEUE_KEY = "axe.journal.offline-queue";
export const JOURNAL_OFFLINE_MAX_ATTEMPTS = 8;

export type QueuedJournalSave = {
  kind: "save";
  tradeId: string;
  accountId: string;
  label: string | null;
  note: string | null;
};

export type QueuedJournalAttachment = {
  kind: "attachment";
  tradeId: string;
  accountId: string;
  attachmentKind: "voice" | "photo" | "screenshot" | "chart";
  fileName: string;
  mime: string;
  bytesBase64: string;
  transcript?: string | null;
};

export type QueuedJournalItem = {
  id: string;
  createdAt: number;
  attempts: number;
  payload: QueuedJournalSave | QueuedJournalAttachment;
};

export function enqueueJournalItem(
  queue: readonly QueuedJournalItem[],
  item: QueuedJournalItem,
): QueuedJournalItem[] {
  if (queue.some((row) => row.id === item.id)) return [...queue];
  return [...queue, item];
}

export function dropJournalItem(
  queue: readonly QueuedJournalItem[],
  id: string,
): QueuedJournalItem[] {
  return queue.filter((row) => row.id !== id);
}

export function markJournalAttempt(
  queue: readonly QueuedJournalItem[],
  id: string,
  now = Date.now(),
): QueuedJournalItem[] {
  return queue.map((row) =>
    row.id === id ? { ...row, attempts: row.attempts + 1, createdAt: row.createdAt || now } : row,
  );
}

export function itemsReadyToFlush(
  queue: readonly QueuedJournalItem[],
  maxAttempts = JOURNAL_OFFLINE_MAX_ATTEMPTS,
): QueuedJournalItem[] {
  return queue.filter((row) => row.attempts < maxAttempts);
}

export function parseJournalQueue(raw: string | null | undefined): QueuedJournalItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedJournalItem);
  } catch {
    return [];
  }
}

function isQueuedJournalItem(value: unknown): value is QueuedJournalItem {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<QueuedJournalItem>;
  if (typeof row.id !== "string" || !row.id) return false;
  if (typeof row.createdAt !== "number") return false;
  if (typeof row.attempts !== "number") return false;
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return false;
  if (payload.kind === "save") {
    return Boolean(payload.tradeId && payload.accountId);
  }
  if (payload.kind === "attachment") {
    return Boolean(payload.tradeId && payload.accountId && payload.bytesBase64 && payload.mime);
  }
  return false;
}

export function readJournalQueueFromStorage(
  storage: Pick<Storage, "getItem"> | null | undefined,
): QueuedJournalItem[] {
  if (!storage) return [];
  try {
    return parseJournalQueue(storage.getItem(JOURNAL_OFFLINE_QUEUE_KEY));
  } catch {
    return [];
  }
}

export function writeJournalQueueToStorage(
  storage: Pick<Storage, "setItem"> | null | undefined,
  queue: readonly QueuedJournalItem[],
): void {
  if (!storage) return;
  storage.setItem(JOURNAL_OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function newQueueId(prefix = "jq"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
