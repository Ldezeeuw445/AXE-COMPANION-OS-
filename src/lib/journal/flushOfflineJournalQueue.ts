import {
  dropJournalItem,
  enqueueJournalItem,
  itemsReadyToFlush,
  markJournalAttempt,
  newQueueId,
  readJournalQueueFromStorage,
  writeJournalQueueToStorage,
  type QueuedJournalAttachment,
  type QueuedJournalItem,
  type QueuedJournalSave,
} from "@/lib/journal/offlineUploadQueue";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadQueue(): QueuedJournalItem[] {
  return readJournalQueueFromStorage(storage());
}

function persist(queue: QueuedJournalItem[]): void {
  writeJournalQueueToStorage(storage(), queue);
}

export function enqueueJournalSave(payload: QueuedJournalSave): void {
  persist(
    enqueueJournalItem(loadQueue(), {
      id: newQueueId("save"),
      createdAt: Date.now(),
      attempts: 0,
      payload,
    }),
  );
}

export function enqueueJournalAttachment(payload: QueuedJournalAttachment): void {
  persist(
    enqueueJournalItem(loadQueue(), {
      id: newQueueId("att"),
      createdAt: Date.now(),
      attempts: 0,
      payload,
    }),
  );
}

export function pendingJournalQueueCount(): number {
  return itemsReadyToFlush(loadQueue()).length;
}

async function postSave(payload: QueuedJournalSave): Promise<boolean> {
  const res = await fetch("/api/journal/quick", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tradeId: payload.tradeId,
      accountId: payload.accountId,
      label: payload.label,
      note: payload.note,
    }),
  });
  return res.ok;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function postAttachment(payload: QueuedJournalAttachment): Promise<boolean> {
  const form = new FormData();
  form.set("tradeId", payload.tradeId);
  form.set("accountId", payload.accountId);
  form.set("kind", payload.attachmentKind);
  if (payload.transcript) form.set("transcript", payload.transcript);
  form.set("file", base64ToBlob(payload.bytesBase64, payload.mime), payload.fileName);
  const res = await fetch("/api/journal/attachments", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  return res.ok;
}

export async function flushOfflineJournalQueue(): Promise<{ flushed: number; remaining: number }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { flushed: 0, remaining: loadQueue().length };
  }

  let queue = loadQueue();
  const ready = itemsReadyToFlush(queue);
  let flushed = 0;

  for (const item of ready) {
    queue = markJournalAttempt(queue, item.id);
    persist(queue);
    try {
      const ok =
        item.payload.kind === "save"
          ? await postSave(item.payload)
          : await postAttachment(item.payload);
      if (ok) {
        queue = dropJournalItem(queue, item.id);
        flushed += 1;
        persist(queue);
      }
    } catch {
      /* stay queued */
    }
  }

  return { flushed, remaining: loadQueue().length };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
