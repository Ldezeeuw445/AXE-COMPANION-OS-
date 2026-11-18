/**
 * Pure rules for AXE long-term memories (/api/axe-memory).
 * Kept separate from the route so they can be unit tested.
 */

export const MEMORY_TYPES = [
  "observation",
  "pattern",
  "preference",
  "weakness",
  "strength",
  "rule",
  "context",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export type ExtractedMemory = {
  memory_type: MemoryType;
  content: string;
  symbol: string | null;
  confidence: number;
};

export const MIN_STORE_CONFIDENCE = 0.6;
export const MAX_MEMORIES_PER_EXTRACTION = 5;
const MAX_MESSAGE_CHARS = 2000;
const MAX_MESSAGES = 20;

export function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === "string" && (MEMORY_TYPES as readonly string[]).includes(value);
}

/** ?limit= parsing: NaN, negative or zero fall back to 20; max 100. */
export function parseMemoryLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(n, 100);
}

/** Last 20 chat messages, each capped, so one pasted wall of text can't blow up the LLM call. */
export function trimConversation(
  messages: unknown,
): Array<{ role: string; content: string }> {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(
      (m): m is { role: string; content: string } =>
        !!m && typeof m === "object" && typeof (m as { role?: unknown }).role === "string" &&
        typeof (m as { content?: unknown }).content === "string",
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
}

/** Parse the extractor's JSON. Bad JSON or bad rows give no memories, never a crash. */
export function parseExtractedMemories(raw: string | null | undefined): ExtractedMemory[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  const list = (parsed as { memories?: unknown })?.memories;
  if (!Array.isArray(list)) return [];
  const out: ExtractedMemory[] = [];
  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    const row = m as Record<string, unknown>;
    const content = typeof row.content === "string" ? row.content.trim().slice(0, 500) : "";
    if (!content) continue; // empty content violates the table check and would fail the insert
    const conf = Number(row.confidence);
    out.push({
      memory_type: isMemoryType(row.memory_type) ? row.memory_type : "observation",
      content,
      symbol:
        typeof row.symbol === "string" && row.symbol.trim()
          ? row.symbol.trim().toUpperCase().slice(0, 20)
          : null,
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
    });
  }
  return out;
}

function normalizeContent(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Which extracted memories should be inserted: confident enough, at most 5,
 * and not a repeat of something the trader already has (same type + same
 * normalized text) or of another row in this same batch. Without this every
 * chat re-stored the same "prefers gold" memory.
 */
export type AxeMemoryTableRow = {
  id?: string;
  memory_type?: string | null;
  type?: string | null;
  content?: string | null;
  symbol?: string | null;
  confidence?: number | null;
  source?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
};

export type AxeMemoryApiRow = {
  id: string;
  memory_type: string;
  content: string;
  symbol: string | null;
  confidence: number;
  source: string;
  created_at: string;
};

function memoryTypeFromRow(row: { memory_type?: string | null; type?: string | null }): string {
  if (isMemoryType(row.memory_type)) return row.memory_type;
  if (isMemoryType(row.type)) return row.type;
  if (typeof row.memory_type === "string" && row.memory_type.trim()) return row.memory_type.trim();
  if (typeof row.type === "string" && row.type.trim()) return row.type.trim();
  return "observation";
}

/** Map a live `axe_memory` row onto the MemoryBrain / GET payload. */
export function mapAxeMemoryApiRow(row: AxeMemoryTableRow): AxeMemoryApiRow {
  const confidence = Number(row.confidence);
  return {
    id: String(row.id ?? ""),
    memory_type: memoryTypeFromRow(row),
    content: typeof row.content === "string" ? row.content : "",
    symbol: typeof row.symbol === "string" && row.symbol.trim() ? row.symbol.trim() : null,
    confidence: Number.isFinite(confidence) ? confidence : 0.7,
    source: typeof row.source === "string" && row.source.trim() ? row.source.trim() : "chat",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

/** Insert shape for the agreed `axe_memory` table (chat already writes type + memory_type). */
export function axeMemoryInsertPayload(userId: string, memory: ExtractedMemory) {
  return {
    user_id: userId,
    memory_type: memory.memory_type,
    type: memory.memory_type,
    content: memory.content,
    symbol: memory.symbol,
    confidence: memory.confidence,
    source: "axe-memory",
    priority: "medium",
  };
}

export function existingMemoriesForDedupe(
  rows: Array<{ memory_type?: string | null; type?: string | null; content?: string | null }>,
): Array<{ memory_type: string; content: string }> {
  return rows.map((row) => ({
    memory_type: memoryTypeFromRow(row),
    content: typeof row.content === "string" ? row.content : "",
  }));
}

export function selectMemoriesToStore(
  extracted: ExtractedMemory[],
  existing: Array<{ memory_type: string; content: string }>,
): ExtractedMemory[] {
  const seen = new Set(existing.map((e) => `${e.memory_type}|${normalizeContent(e.content)}`));
  const out: ExtractedMemory[] = [];
  for (const m of extracted) {
    if (m.confidence < MIN_STORE_CONFIDENCE) continue;
    const key = `${m.memory_type}|${normalizeContent(m.content)}`;
    if (!normalizeContent(m.content) || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= MAX_MEMORIES_PER_EXTRACTION) break;
  }
  return out;
}
