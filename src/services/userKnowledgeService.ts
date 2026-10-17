import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

import { firstNonEmptyEnv } from "@/lib/envFallback";
import { callLLM } from "@/services/llmClient";

/**
 * Per-user knowledge writer — the missing half of AXE's RAG.
 *
 * Retrieval was already per-user on both assistants: getRelevantKnowledge and
 * getRelevantIntelKnowledge filter `user_id is null OR user_id = <caller>`, and
 * match_axe_knowledge_chunks does the same inside the pgvector search. But the
 * only writer was knowledgeSyncService, which seeds the shipped markdown with
 * `user_id: null`. So every user retrieved the same 23 global documents and
 * nothing else: the shelf was per-user, nobody ever put a book on it.
 *
 * This distils each trader's own material into user-scoped documents that land
 * on that same shelf. Because retrieval already reads them, writing them is all
 * it takes to close the loop — no prompt surgery, and both AXE and AXE Intel
 * pick them up on their next question.
 *
 * Deliberately honest about thin data: a topic with nothing behind it is
 * skipped and reported, never written as a confident-sounding empty document.
 * A trader with two trades should not be handed a "profile" that reads like it
 * knows them.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const CHUNK_MAX = 1100;

/** Enough material for a distillation to say something that isn't noise. */
const MIN_ITEMS_PER_TOPIC = 3;

export type UserKnowledgeTopic = "trading-profile" | "lessons" | "preferences";

export type UserKnowledgeSummary = {
  userId: string;
  docsWritten: number;
  chunksEmbedded: number;
  /** Topics with too little material, and why — surfaced, not silently dropped. */
  skipped: Array<{ topic: UserKnowledgeTopic; reason: string }>;
  errors: string[];
};

type TopicPlan = {
  topic: UserKnowledgeTopic;
  title: string;
  category: string;
  /** The trader's raw material, one line per item. */
  lines: string[];
  /** What the distillation should produce from those lines. */
  instruction: string;
};

function emptySummary(userId: string): UserKnowledgeSummary {
  return { userId, docsWritten: 0, chunksEmbedded: 0, skipped: [], errors: [] };
}

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function clean(value: unknown, max = 240): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/* ── gathering ─────────────────────────────────────────────────────────── */

async function gatherTradingProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const since = iso(120);
  const lines: string[] = [];

  const [brokerRes, mt5Res, journalRes] = await Promise.all([
    supabase
      .from("broker_trades")
      .select("symbol,side,volume,pnl,open_time,close_time")
      .eq("user_id", userId)
      .gte("close_time", since)
      .order("close_time", { ascending: false })
      .limit(200),
    supabase
      .from("mt5_closed_positions")
      .select("symbol,type,volume,net_pnl,opened_at,closed_at,close_reason,comment")
      .eq("user_id", userId)
      .gte("closed_at", since)
      .order("closed_at", { ascending: false })
      .limit(200),
    supabase
      .from("user_journal_entries")
      .select("symbol,notes,rating,tags,pnl,created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  for (const row of brokerRes.data ?? []) {
    const pnl = num(row.pnl);
    lines.push(
      `TRADE ${clean(row.close_time, 10)} ${clean(row.symbol, 16)} ${clean(row.side, 8)} ` +
        `vol=${num(row.volume) ?? "?"} pnl=${pnl === null ? "?" : pnl.toFixed(2)}`,
    );
  }

  for (const row of mt5Res.data ?? []) {
    const pnl = num(row.net_pnl);
    const reason = clean(row.close_reason, 24);
    const comment = clean(row.comment, 60);
    lines.push(
      `TRADE ${clean(row.closed_at, 10)} ${clean(row.symbol, 16)} ${clean(row.type, 8)} ` +
        `vol=${num(row.volume) ?? "?"} pnl=${pnl === null ? "?" : pnl.toFixed(2)}` +
        (reason ? ` close=${reason}` : "") +
        (comment ? ` note=${comment}` : ""),
    );
  }

  for (const row of journalRes.data ?? []) {
    const tags = Array.isArray(row.tags) ? row.tags.map((t) => clean(t, 24)).join(",") : "";
    lines.push(
      `JOURNAL ${clean(row.created_at, 10)} ${clean(row.symbol, 16)}` +
        (row.rating ? ` rating=${clean(row.rating, 16)}` : "") +
        (tags ? ` tags=${tags}` : "") +
        ` — ${clean(row.notes, 300)}`,
    );
  }

  return lines;
}

async function gatherLessons(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("assistant_learning_signals")
    .select("signal_type,payload,created_at")
    .eq("user_id", userId)
    .gte("created_at", iso(180))
    .order("created_at", { ascending: false })
    .limit(400);

  const lines: string[] = [];
  for (const row of data ?? []) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const when = clean(row.created_at, 10);
    switch (row.signal_type) {
      case "journal_label":
        lines.push(
          `LABEL ${when} ${clean(payload.symbol, 16)} label=${clean(payload.label, 24)} ` +
            `${clean(payload.note ?? payload.notes, 240)}`,
        );
        break;
      case "trade_alignment":
        lines.push(
          `ALIGNMENT ${when} ${clean(payload.symbol, 16)} ` +
            `score=${num(payload.alignment_score) ?? "?"} ${clean(payload.rationale ?? payload.reason, 240)}`,
        );
        break;
      case "ai_correction":
        lines.push(`CORRECTION ${when} ${clean(payload.correction ?? payload.text ?? payload.content, 400)}`);
        break;
      case "message_feedback":
        lines.push(
          `FEEDBACK ${when} rating=${clean(payload.rating, 8)} ${clean(payload.reason ?? payload.comment, 240)}`,
        );
        break;
      default:
        lines.push(`SIGNAL ${when} ${clean(row.signal_type, 32)} ${clean(JSON.stringify(payload), 240)}`);
    }
  }
  return lines;
}

async function gatherPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("assistant_memory_entries")
    .select("scope,entry_key,content,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(200);

  return (data ?? []).map(
    (row) =>
      `MEMORY ${clean(row.scope, 40)}${row.entry_key ? `/${clean(row.entry_key, 40)}` : ""}: ` +
      clean(row.content, 400),
  );
}

/* ── distillation ──────────────────────────────────────────────────────── */

const DISTILL_SYSTEM = [
  "You write a private knowledge file that a trading assistant will retrieve later",
  "to remember one specific trader.",
  "",
  "Rules:",
  "- Write only what the supplied records actually support. Never invent a number,",
  "  a symbol, a session or a habit that is not in them.",
  "- Prefer specific, retrievable statements over general trading advice. The",
  "  assistant already knows generic theory; it does not know this person.",
  "- If the records are thin, say so plainly and keep the file short. A short",
  "  honest file is worth more than a padded one.",
  "- No preamble, no sign-off, no markdown headings above level 2.",
  "- Write in the language the trader's own notes are written in; default to English.",
].join("\n");

async function distil(plan: TopicPlan): Promise<string | null> {
  const body = plan.lines.slice(0, 220).join("\n").slice(0, 24000);

  const response = await callLLM(
    {
      messages: [
        { role: "system", content: DISTILL_SYSTEM },
        {
          role: "user",
          content: `${plan.instruction}\n\nRecords (most recent first):\n${body}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 900,
    },
    // 'briefing' pins this to OpenAI. This runs unattended in a cron, where an
    // Ollama cold start on the VPS is a silent failure nobody would notice.
    "briefing",
  );

  const content = response.content?.trim();
  return content && content.length > 40 ? content : null;
}

/* ── writing ───────────────────────────────────────────────────────────── */

function chunkText(text: string, max = CHUNK_MAX): string[] {
  const paras = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > max && cur) {
      out.push(cur.trim());
      cur = p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur.trim());
  return out.length ? out : [text.slice(0, max)];
}

async function writeDocument(
  supabase: SupabaseClient,
  openai: OpenAI | null,
  userId: string,
  plan: TopicPlan,
  content: string,
): Promise<{ chunksEmbedded: number; error?: string }> {
  // Namespaced by user id: `slug` carries a unique constraint, so an un-scoped
  // slug would have one trader's file overwrite another's.
  const slug = `user/${userId}/${plan.topic}`;
  const tags = [`user:${userId}`, `topic:${plan.topic}`, "source:learned"];

  const { data: docRow, error: upErr } = await supabase
    .from("axe_knowledge_documents")
    .upsert(
      {
        slug,
        title: plan.title,
        category: plan.category,
        content,
        source_type: "user_learned",
        tags,
        user_id: userId,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (upErr || !docRow) return { chunksEmbedded: 0, error: `doc:${plan.topic}:${upErr?.message ?? "no row"}` };

  const docId = docRow.id as string;
  await supabase.from("axe_knowledge_chunks").delete().eq("document_id", docId);

  const chunks = chunkText(content);
  const { error: chErr } = await supabase.from("axe_knowledge_chunks").insert(
    chunks.map((chunk_text, chunk_index) => ({ document_id: docId, chunk_index, chunk_text, tags })),
  );
  if (chErr) return { chunksEmbedded: 0, error: `chunks:${plan.topic}:${chErr.message}` };

  if (!openai) {
    // The rows are in place; the weekly knowledge sync embeds anything with a
    // null embedding, so this degrades to "found by keyword until then".
    return { chunksEmbedded: 0 };
  }

  const { data: fresh } = await supabase
    .from("axe_knowledge_chunks")
    .select("id,chunk_text")
    .eq("document_id", docId)
    .order("chunk_index", { ascending: true });

  if (!fresh?.length) return { chunksEmbedded: 0 };

  try {
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: fresh.map((c) => String(c.chunk_text).slice(0, 8000)),
      dimensions: EMBEDDING_DIM,
    });
    let embedded = 0;
    for (let i = 0; i < fresh.length; i += 1) {
      const vector = res.data[i]?.embedding;
      if (!vector) continue;
      const { error } = await supabase
        .from("axe_knowledge_chunks")
        .update({ embedding: vector })
        .eq("id", fresh[i].id);
      if (!error) embedded += 1;
    }
    return { chunksEmbedded: embedded };
  } catch (e) {
    return { chunksEmbedded: 0, error: `embed:${plan.topic}:${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ── entry point ───────────────────────────────────────────────────────── */

export async function runUserKnowledgeSync(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserKnowledgeSummary> {
  const summary = emptySummary(userId);

  const [profileLines, lessonLines, preferenceLines] = await Promise.all([
    gatherTradingProfile(supabase, userId),
    gatherLessons(supabase, userId),
    gatherPreferences(supabase, userId),
  ]);

  const plans: TopicPlan[] = [
    {
      topic: "trading-profile",
      title: "How this trader actually trades",
      category: "profile",
      lines: profileLines,
      instruction:
        "From these closed trades and journal entries, write what is actually true about " +
        "how this trader trades: the instruments they touch, typical size, how long they " +
        "hold, which setups repeat, where the losses cluster, and any habit the records " +
        "genuinely show. Cite concrete symbols and figures from the records.",
    },
    {
      topic: "lessons",
      title: "What AXE has got right and wrong for this trader",
      category: "profile",
      lines: lessonLines,
      instruction:
        "These are feedback signals about the assistant's own output: corrections the " +
        "trader made, thumbs up/down, manual trade labels and alignment scores. Write what " +
        "the assistant should do differently with this specific person — what it has been " +
        "wrong about, what it has been right about, and the pattern behind each. Be blunt.",
    },
    {
      topic: "preferences",
      title: "This trader's stated preferences and context",
      category: "profile",
      lines: preferenceLines,
      instruction:
        "These are notes and memory entries about this trader. Write a compact reference of " +
        "their stated preferences, their vocabulary, their accounts and instruments, their " +
        "risk rules, and anything standing they have asked for. Facts only.",
    },
  ];

  const apiKey = firstNonEmptyEnv("OPENAI_API_KEY", "OPEN_AI_API_KEY");
  const openai = apiKey ? new OpenAI({ apiKey }) : null;
  if (!openai) summary.errors.push("missing_openai_api_key_embeddings_skipped");

  for (const plan of plans) {
    if (plan.lines.length < MIN_ITEMS_PER_TOPIC) {
      summary.skipped.push({
        topic: plan.topic,
        reason: `only ${plan.lines.length} records (need ${MIN_ITEMS_PER_TOPIC})`,
      });
      continue;
    }

    let content: string | null = null;
    try {
      content = await distil(plan);
    } catch (e) {
      summary.errors.push(`distil:${plan.topic}:${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (!content) {
      summary.skipped.push({ topic: plan.topic, reason: "distillation returned nothing usable" });
      continue;
    }

    const written = await writeDocument(supabase, openai, userId, plan, content);
    if (written.error) summary.errors.push(written.error);
    else summary.docsWritten += 1;
    summary.chunksEmbedded += written.chunksEmbedded;
  }

  return summary;
}

export type UserKnowledgeBatchSummary = {
  usersAttempted: number;
  docsWritten: number;
  chunksEmbedded: number;
  perUser: UserKnowledgeSummary[];
};

/**
 * Every user who has produced anything worth learning from. Deliberately not
 * limited to paid plans: a trial user whose assistant never grows has no reason
 * to become a paying one.
 */
export async function runUserKnowledgeBatch(
  supabase: SupabaseClient,
  opts?: { maxUsers?: number },
): Promise<UserKnowledgeBatchSummary> {
  const maxUsers = opts?.maxUsers ?? 25;
  const out: UserKnowledgeBatchSummary = {
    usersAttempted: 0,
    docsWritten: 0,
    chunksEmbedded: 0,
    perUser: [],
  };

  const ids = new Set<string>();
  const sources: Array<[string, string]> = [
    ["assistant_learning_signals", "created_at"],
    ["assistant_memory_entries", "updated_at"],
    ["user_journal_entries", "created_at"],
    ["broker_trades", "updated_at"],
  ];

  for (const [table, orderCol] of sources) {
    const { data } = await supabase
      .from(table)
      .select("user_id")
      .order(orderCol, { ascending: false })
      .limit(500);
    for (const row of data ?? []) {
      const id = row.user_id as string | null;
      if (id) ids.add(id);
      if (ids.size >= maxUsers) break;
    }
    if (ids.size >= maxUsers) break;
  }

  for (const userId of [...ids].slice(0, maxUsers)) {
    out.usersAttempted += 1;
    const summary = await runUserKnowledgeSync(supabase, userId);
    out.docsWritten += summary.docsWritten;
    out.chunksEmbedded += summary.chunksEmbedded;
    out.perUser.push(summary);
  }

  return out;
}
