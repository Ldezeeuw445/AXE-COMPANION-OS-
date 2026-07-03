export const KRATER_DAILY_NEWS_PROMPT = `You are AXE, a personal trading assistant. Write a concise daily trading news brief for active traders.

Cover: top macro headlines, central bank/Fed news, major earnings, FX and commodities movers, and 2–3 actionable watch items for today's session.

Format: 4–6 bullet points, max 180 words. No trade advice or specific entries.
Tone: direct, factual, confident. Do not use personal names — this is a broadcast for all AXE users.
End with one line: "Watch today: …"`;

export const KRATER_MARKET_RECAP_PROMPT = `You are AXE. Write an end-of-day market recap for traders.

Cover: major US and European indices performance, biggest tech movers, top crypto by market cap, key macro events, and a brief sentiment summary.

Format: short bullets + 1 closing line "What to watch tomorrow."
Max 200 words. No trade advice. Factual only. Do not use personal names — this is a broadcast for all AXE users.`;

export type KraterBroadcastType = "daily_news" | "market_recap";

export type KraterFetchResult = {
  ok: boolean;
  status: number;
  path: string;
  json: unknown;
  errorText?: string;
};

export type KraterProbeResult = {
  broadcastType: KraterBroadcastType;
  taskId: string;
  conversationId: string;
  runs: {
    status: number;
    topKeys: string[];
    itemCount: number;
    firstItemKeys: string[];
    extractedPreview: string | null;
    errorText?: string;
  };
  conversation: {
    status: number;
    topKeys: string[];
    messageCount: number;
    assistantCount: number;
    extractedPreview: string | null;
    errorText?: string;
  };
};

const DEFAULT_TASK_IDS: Record<KraterBroadcastType, string> = {
  daily_news: "fb396f32-ada0-49f9-b860-c279c08c8c62",
  market_recap: "7d282b5c-0503-4e8a-a3f5-3bce6d69b838",
};

const DEFAULT_CONVERSATION_IDS: Record<KraterBroadcastType, string> = {
  daily_news: "542bfd9b-3994-41ba-b026-80e8985e5862",
  market_recap: "2713f698-855d-45cd-9a40-31e6d576fd51",
};

function kraterApiBase(): string {
  return (process.env.KRATER_API_BASE?.trim() || "https://api.krater.ai").replace(/\/$/, "");
}

function kraterApiKey(): string | null {
  return process.env.KRATER_API_KEY?.trim() || null;
}

export function taskIdFor(broadcastType: KraterBroadcastType): string {
  if (broadcastType === "daily_news") {
    return process.env.KRATER_TASK_ID_DAILY_NEWS?.trim() || DEFAULT_TASK_IDS.daily_news;
  }
  return process.env.KRATER_TASK_ID_MARKET_RECAP?.trim() || DEFAULT_TASK_IDS.market_recap;
}

export function conversationIdFor(broadcastType: KraterBroadcastType): string {
  if (broadcastType === "daily_news") {
    return (
      process.env.KRATER_CONVERSATION_ID_DAILY_NEWS?.trim() ||
      DEFAULT_CONVERSATION_IDS.daily_news
    );
  }
  return (
    process.env.KRATER_CONVERSATION_ID_MARKET_RECAP?.trim() ||
    DEFAULT_CONVERSATION_IDS.market_recap
  );
}

function kraterSyncMode(): "generate" | "poll" {
  const mode = process.env.KRATER_SYNC_MODE?.trim().toLowerCase();
  if (mode === "poll") return "poll";
  // Developer API (kr_live_) does not expose scheduled-task/conversation endpoints.
  return "generate";
}

function extractChatCompletionText(json: unknown): string {
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.choices)) {
      for (const choice of obj.choices) {
        if (!choice || typeof choice !== "object") continue;
        const message = (choice as Record<string, unknown>).message;
        const text = extractMessageContent(message);
        if (text) return text;
      }
    }
  }
  return extractMessageContent(json) || extractOutputFields((json ?? {}) as Record<string, unknown>);
}

function preview(text: string | null, max = 160): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function objectKeys(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>)
    : [];
}

/** OpenAI-style content blocks + plain strings. */
export function extractMessageContent(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const parts = value
      .map((part) => extractMessageContent(part))
      .filter(Boolean);
    return parts.join("\n").trim();
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string" && obj.text.trim()) return obj.text.trim();
    if (typeof obj.value === "string" && obj.value.trim()) return obj.value.trim();
    if (obj.content != null) {
      const nested = extractMessageContent(obj.content);
      if (nested) return nested;
    }
  }
  return "";
}

function extractOutputFields(record: Record<string, unknown>): string {
  for (const key of [
    "output",
    "response",
    "result",
    "generated_text",
    "output_text",
    "completion",
    "body",
    "text",
    "message",
  ]) {
    const text = extractMessageContent(record[key]);
    if (text) return text;
  }
  return "";
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> => Boolean(item && typeof item === "object"),
    );
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["runs", "data", "items", "results", "messages"]) {
      const nested = obj[key];
      if (Array.isArray(nested)) {
        return nested.filter(
          (item): item is Record<string, unknown> => Boolean(item && typeof item === "object"),
        );
      }
      if (nested && typeof nested === "object") {
        const deeper = asRecordArray(nested);
        if (deeper.length > 0) return deeper;
      }
    }
  }
  return [];
}

function newestFirst(items: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(
      String(a.created_at ?? a.createdAt ?? a.started_at ?? a.timestamp ?? a.finished_at ?? 0),
    );
    const tb = Date.parse(
      String(b.created_at ?? b.createdAt ?? b.started_at ?? b.timestamp ?? b.finished_at ?? 0),
    );
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
}

export async function kraterFetchJson(path: string): Promise<KraterFetchResult> {
  const key = kraterApiKey();
  if (!key) {
    return {
      ok: false,
      status: 0,
      path,
      json: null,
      errorText: "KRATER_API_KEY is not configured",
    };
  }

  const res = await fetch(`${kraterApiBase()}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const rawText = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = rawText;
  }

  if (!res.ok) {
    const apiMessage =
      json && typeof json === "object"
        ? String((json as { error?: { message?: string } }).error?.message ?? "")
        : "";
    return {
      ok: false,
      status: res.status,
      path,
      json,
      errorText: apiMessage || rawText.slice(0, 240) || `HTTP ${res.status}`,
    };
  }

  return { ok: true, status: res.status, path, json };
}

function extractFromRunsPayload(json: unknown): string | null {
  const runs = newestFirst(asRecordArray(json));
  for (const run of runs) {
    const status = String(run.status ?? run.state ?? "").toLowerCase();
    if (status && !["completed", "success", "done", "finished", ""].includes(status)) {
      continue;
    }
    const text = extractOutputFields(run);
    if (text) return text;
  }

  for (const run of runs) {
    const text = extractOutputFields(run);
    if (text) return text;
  }

  return null;
}

function extractFromConversationPayload(json: unknown): string | null {
  const messages = asRecordArray(json);
  const ordered =
    messages.length > 1 &&
    !messages.some((m) => m.created_at || m.createdAt || m.timestamp)
      ? messages
      : newestFirst(messages);

  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const message = ordered[i];
    const role = String(message.role ?? message.sender ?? message.type ?? "").toLowerCase();
    if (role.includes("user")) continue;
    if (role.includes("assistant") || role.includes("model") || role.includes("bot")) {
      const text = extractMessageContent(message.content ?? message.text ?? message.body ?? message);
      if (text) return text;
    }
  }

  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const message = ordered[i];
    const role = String(message.role ?? message.sender ?? "").toLowerCase();
    if (role.includes("user")) continue;
    const text = extractMessageContent(message.content ?? message.text ?? message.body ?? message);
    if (text) return text;
  }

  return null;
}

/** Option A — GET /v1/scheduled-tasks/{task_id}/runs */
async function fetchScheduledTaskRunsOutput(taskId: string): Promise<{
  body: string | null;
  fetch: KraterFetchResult;
}> {
  const fetch = await kraterFetchJson(`/v1/scheduled-tasks/${taskId}/runs`);
  if (!fetch.ok) return { body: null, fetch };
  return { body: extractFromRunsPayload(fetch.json), fetch };
}

/** Option B — GET /v1/conversations/{conversation_id}/messages */
async function fetchConversationLatestAssistantOutput(conversationId: string): Promise<{
  body: string | null;
  fetch: KraterFetchResult;
}> {
  const fetch = await kraterFetchJson(`/v1/conversations/${conversationId}/messages`);
  if (!fetch.ok) return { body: null, fetch };
  return { body: extractFromConversationPayload(fetch.json), fetch };
}

export async function probeKraterBroadcastSource(
  broadcastType: KraterBroadcastType,
): Promise<KraterProbeResult> {
  const taskId = taskIdFor(broadcastType);
  const conversationId = conversationIdFor(broadcastType);
  const runsResult = await fetchScheduledTaskRunsOutput(taskId);
  const conversationResult = await fetchConversationLatestAssistantOutput(conversationId);
  const runItems = newestFirst(asRecordArray(runsResult.fetch.json));

  return {
    broadcastType,
    taskId,
    conversationId,
    runs: {
      status: runsResult.fetch.status,
      topKeys: objectKeys(runsResult.fetch.json),
      itemCount: runItems.length,
      firstItemKeys: runItems[0] ? Object.keys(runItems[0]) : [],
      extractedPreview: preview(runsResult.body),
      errorText: runsResult.fetch.errorText,
    },
    conversation: {
      status: conversationResult.fetch.status,
      topKeys: objectKeys(conversationResult.fetch.json),
      messageCount: asRecordArray(conversationResult.fetch.json).length,
      assistantCount: asRecordArray(conversationResult.fetch.json).filter((m) =>
        String(m.role ?? "").toLowerCase().includes("assistant"),
      ).length,
      extractedPreview: preview(conversationResult.body),
      errorText: conversationResult.fetch.errorText,
    },
  };
}

export type KraterGenerateProbeResult = {
  model: string;
  status: number;
  ok: boolean;
  preview: string | null;
  errorText?: string;
};

function broadcastModelCandidates(): string[] {
  const configured = process.env.KRATER_BROADCAST_MODEL?.trim();
  const defaults = [
    "google/gemini-2.5-flash",
    "gemini-2.5-flash",
    "google/gemini-2.0-flash",
    "gemini-2.0-flash",
  ];
  return [...new Set([configured, ...defaults].filter(Boolean))] as string[];
}

async function kraterChatCompletion(
  model: string,
  prompt: string,
): Promise<{ ok: boolean; status: number; text: string | null; errorText?: string }> {
  const key = kraterApiKey();
  if (!key) {
    return { ok: false, status: 0, text: null, errorText: "KRATER_API_KEY is not configured" };
  }

  const res = await fetch(`${kraterApiBase()}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.35,
    }),
    cache: "no-store",
  });

  const rawText = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = rawText;
  }

  if (!res.ok) {
    const apiMessage =
      json && typeof json === "object"
        ? String((json as { error?: { message?: string } }).error?.message ?? "")
        : "";
    return {
      ok: false,
      status: res.status,
      text: null,
      errorText: apiMessage || rawText.slice(0, 240) || `HTTP ${res.status}`,
    };
  }

  const text = extractChatCompletionText(json);
  return { ok: Boolean(text), status: res.status, text, errorText: text ? undefined : "empty output" };
}

export async function probeKraterGenerate(
  broadcastType: KraterBroadcastType = "daily_news",
): Promise<KraterGenerateProbeResult[]> {
  const prompt = `Reply with exactly: AXE broadcast probe ok (${broadcastType})`;
  const results: KraterGenerateProbeResult[] = [];

  for (const model of broadcastModelCandidates()) {
    const attempt = await kraterChatCompletion(model, prompt);
    results.push({
      model,
      status: attempt.status,
      ok: attempt.ok,
      preview: preview(attempt.text, 120),
      errorText: attempt.errorText,
    });
    if (attempt.ok) break;
  }

  return results;
}

export async function generateBroadcastViaKraterChat(
  broadcastType: KraterBroadcastType,
): Promise<string> {
  if (!kraterApiKey()) {
    throw new Error("KRATER_API_KEY is not configured");
  }

  const prompt =
    broadcastType === "daily_news" ? KRATER_DAILY_NEWS_PROMPT : KRATER_MARKET_RECAP_PROMPT;
  const errors: string[] = [];

  for (const model of broadcastModelCandidates()) {
    const attempt = await kraterChatCompletion(model, prompt);
    if (attempt.text) return attempt.text;
    errors.push(`${model}: HTTP ${attempt.status} ${attempt.errorText ?? ""}`.trim());
  }

  throw new Error(`Krater chat failed for all models. ${errors.join(" | ")}`);
}

export async function fetchKraterBroadcastOutput(
  broadcastType: KraterBroadcastType,
): Promise<{ body: string; source: "krater_task" | "krater_conversation" | "krater_chat" }> {
  if (kraterSyncMode() === "generate") {
    const body = await generateBroadcastViaKraterChat(broadcastType);
    return { body, source: "krater_chat" };
  }

  const taskId = taskIdFor(broadcastType);
  const conversationId = conversationIdFor(broadcastType);
  const errors: string[] = [];

  const runs = await fetchScheduledTaskRunsOutput(taskId);
  if (runs.body) return { body: runs.body, source: "krater_task" };
  errors.push(
    runs.fetch.ok
      ? `runs: empty output (${runs.fetch.status})`
      : `runs: HTTP ${runs.fetch.status} ${runs.fetch.errorText ?? ""}`.trim(),
  );

  const conversation = await fetchConversationLatestAssistantOutput(conversationId);
  if (conversation.body) return { body: conversation.body, source: "krater_conversation" };
  errors.push(
    conversation.fetch.ok
      ? `conversation: empty output (${conversation.fetch.status})`
      : `conversation: HTTP ${conversation.fetch.status} ${conversation.fetch.errorText ?? ""}`.trim(),
  );

  const allowFallback =
    process.env.KRATER_SYNC_FALLBACK_GENERATE?.trim().toLowerCase() !== "false";
  if (!allowFallback) {
    throw new Error(
      `Could not fetch Krater output for ${broadcastType}. ${errors.join(" | ")}`,
    );
  }

  const body = await generateBroadcastViaKraterChat(broadcastType);
  return { body, source: "krater_chat" };
}

export function getKraterSyncMode(): "generate" | "poll" {
  return kraterSyncMode();
}

export function defaultBroadcastTitle(broadcastType: KraterBroadcastType): string {
  return broadcastType === "market_recap" ? "Market Recap" : "Daily News";
}

/** Strip Krater personalization like ", Luka:" from broadcast copy. */
export function normalizeBroadcastBody(body: string): string {
  return body
    .replace(/,\s*Luka\s*:/gi, ":")
    .replace(/for active traders,\s*Luka/gi, "for active traders")
    .replace(/for traders,\s*Luka/gi, "for traders")
    .trim();
}
