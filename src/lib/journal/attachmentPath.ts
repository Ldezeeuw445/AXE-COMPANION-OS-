export const JOURNAL_ATTACHMENT_BUCKET = "journal-attachments";

export const JOURNAL_ATTACHMENT_KINDS = ["voice", "photo", "screenshot", "chart"] as const;
export type JournalAttachmentKind = (typeof JOURNAL_ATTACHMENT_KINDS)[number];

export const JOURNAL_ATTACHMENT_MAX_BYTES = 12 * 1024 * 1024;

const ALLOWED_MIME: Record<JournalAttachmentKind, readonly string[]> = {
  voice: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/x-m4a"],
  photo: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  screenshot: ["image/jpeg", "image/png", "image/webp"],
  chart: ["image/png", "image/jpeg", "image/webp"],
};

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/x-m4a": "m4a",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export function isJournalAttachmentKind(value: string): value is JournalAttachmentKind {
  return (JOURNAL_ATTACHMENT_KINDS as readonly string[]).includes(value);
}

export function allowedMimeForKind(kind: JournalAttachmentKind): readonly string[] {
  return ALLOWED_MIME[kind];
}

export function isAllowedMime(kind: JournalAttachmentKind, mime: string): boolean {
  const normalized = mime.trim().toLowerCase();
  return ALLOWED_MIME[kind].includes(normalized);
}

export function extensionForMime(mime: string): string {
  return EXT_BY_MIME[mime.trim().toLowerCase()] ?? "bin";
}

/**
 * Owner-only object key. First path segment MUST be the auth user id so
 * storage policies can key off it without reading a second table.
 */
export function journalAttachmentObjectPath(input: {
  userId: string;
  tradeId: string;
  attachmentId: string;
  mime: string;
}): string {
  const userId = input.userId.trim();
  const tradeId = input.tradeId.trim();
  const attachmentId = input.attachmentId.trim();
  if (!userId || !tradeId || !attachmentId) {
    throw new Error("attachment path requires userId, tradeId and attachmentId");
  }
  if (userId.includes("/") || tradeId.includes("/") || attachmentId.includes("/")) {
    throw new Error("attachment path segments cannot contain slashes");
  }
  return `${userId}/${tradeId}/${attachmentId}.${extensionForMime(input.mime)}`;
}

export function ownerIdFromObjectPath(path: string): string | null {
  const first = path.split("/")[0]?.trim() ?? "";
  return first || null;
}

export function objectPathBelongsToUser(path: string, userId: string): boolean {
  return ownerIdFromObjectPath(path) === userId.trim();
}
