import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";
import { recordProactiveFeedEvent } from "@/lib/feed/recordProactiveFeedEvent";
import { fetchCockpitTodaySummary } from "@/services/cockpitService";
import { getOpenAiApiKey } from "@/lib/axe/embeddings";

export type DailyBriefingSummary = {
  usersChecked: number;
  briefingsCreated: number;
  pushesSent: number;
  errors: string[];
};

type BriefingPayload = {
  title: string;
  body: string;
  highlights: string[];
  chatPrefill: string;
};

function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function briefingEventKey(userId: string, dateKey: string): string {
  return `daily_briefing:${dateKey}:${userId}`;
}

async function loadUserContext(supabase: SupabaseClient, userId: string) {
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [today, memoryRes, tradesRes, messagesRes, snapshotRes, signalsRes] = await Promise.all([
    fetchCockpitTodaySummary(supabase, userId),
    supabase
      .from("assistant_memory_entries")
      .select("entry_key,content")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("broker_trades")
      .select("symbol,side,pnl,close_time")
      .eq("user_id", userId)
      .not("close_time", "is", null)
      .gte("close_time", since7d)
      .order("close_time", { ascending: false })
      .limit(6),
    supabase
      .from("messages")
      .select("role,content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("assistant_cockpit_snapshots")
      .select("alignment_score,learning_progress")
      .eq("user_id", userId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("assistant_learning_signals")
      .select("signal_type,payload")
      .eq("user_id", userId)
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  let intelSummary = "";
  try {
    const intel = await loadIntelSnapshot();
    const feeds = (intel.providers ?? [])
      .filter((p) => p.state === "live")
      .map((p) => p.label)
      .slice(0, 6);
    intelSummary = `Intel feeds live: ${feeds.join(", ") || "none"}. Chokepoints: ${(intel.chokepoints ?? []).slice(0, 3).map((c) => c.name).join("; ") || "none"}.`;
  } catch {
    intelSummary = "Intel snapshot unavailable.";
  }

  const alignmentPct = snapshotRes.data?.alignment_score
    ? Math.round(Number(snapshotRes.data.alignment_score) * (Number(snapshotRes.data.alignment_score) > 1 ? 1 : 100))
    : 0;

  return {
    today,
    alignmentPct,
    learningHeadline:
      (snapshotRes.data?.learning_progress as { headline?: string } | null)?.headline ?? "",
    memory: (memoryRes.data ?? []).map((m) => `${m.entry_key}: ${String(m.content).slice(0, 160)}`),
    recentTrades: (tradesRes.data ?? []).map(
      (t) => `${t.symbol} ${t.side} PnL ${t.pnl ?? "—"} @ ${t.close_time}`,
    ),
    recentChat: (messagesRes.data ?? [])
      .filter((m) => m.role === "user")
      .map((m) => String(m.content).slice(0, 140)),
    signals: (signalsRes.data ?? []).map((s) => `${s.signal_type}: ${JSON.stringify(s.payload).slice(0, 100)}`),
    intelSummary,
  };
}

function fallbackBriefing(ctx: Awaited<ReturnType<typeof loadUserContext>>): BriefingPayload {
  const highlights = [
    ctx.today.chatMessages > 0
      ? `${ctx.today.chatMessages} chat message${ctx.today.chatMessages === 1 ? "" : "s"} today`
      : "Quiet chat day — good time to plan setups",
    ctx.today.tradesClosed > 0
      ? `${ctx.today.tradesClosed} trade${ctx.today.tradesClosed === 1 ? "" : "s"} closed today`
      : "No closes yet — protect capital until your A+ setup",
    ctx.alignmentPct > 0 ? `Cockpit alignment at ${ctx.alignmentPct}%` : "Cockpit still calibrating",
  ];

  const body = [
    highlights.join(" · "),
    ctx.intelSummary,
    ctx.recentTrades.length ? `Recent: ${ctx.recentTrades.slice(0, 3).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const chatPrefill =
    "Walk me through today's AXE briefing — what matters for my watchlist, risk, and the next session?";

  return {
    title: "Your daily AXE briefing",
    body,
    highlights,
    chatPrefill,
  };
}

async function generateBriefingWithGpt(
  ctx: Awaited<ReturnType<typeof loadUserContext>>,
): Promise<BriefingPayload> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return fallbackBriefing(ctx);

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            'You write a concise daily trading briefing for one trader. Return JSON only: { "title": string, "body": string (3-5 short paragraphs, plain text), "highlights": string[3], "chatPrefill": string (one question they can paste into AXE chat) }. Be specific to their data. No hype.',
        },
        {
          role: "user",
          content: JSON.stringify(ctx),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallbackBriefing(ctx);
    const parsed = JSON.parse(match[0]) as Partial<BriefingPayload>;
    if (!parsed.title || !parsed.body) return fallbackBriefing(ctx);
    return {
      title: parsed.title,
      body: parsed.body,
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 5) : [],
      chatPrefill:
        parsed.chatPrefill ??
        "Walk me through today's AXE briefing — what matters for my watchlist, risk, and the next session?",
    };
  } catch {
    return fallbackBriefing(ctx);
  }
}

export async function runDailyBriefingForUser(
  supabase: SupabaseClient,
  userId: string,
  opts?: { dateKey?: string; push?: boolean },
): Promise<{ created: boolean; pushed: boolean }> {
  const dateKey = opts?.dateKey ?? utcDateKey();

  const { data: existing } = await supabase
    .from("axe_daily_briefings")
    .select("id")
    .eq("user_id", userId)
    .eq("briefing_date", dateKey)
    .maybeSingle();

  if (existing?.id) return { created: false, pushed: false };

  const ctx = await loadUserContext(supabase, userId);
  const briefing = await generateBriefingWithGpt(ctx);

  const { error: saveErr } = await supabase.from("axe_daily_briefings").insert({
    user_id: userId,
    briefing_date: dateKey,
    title: briefing.title,
    body: briefing.body,
    highlights: briefing.highlights,
    chat_prefill: briefing.chatPrefill,
  });

  if (saveErr) {
    if (saveErr.code === "23505") return { created: false, pushed: false };
    throw new Error(saveErr.message);
  }

  const eventKey = briefingEventKey(userId, dateKey);
  const chatUrl = `/chat?q=${encodeURIComponent(briefing.chatPrefill)}`;
  const feedBody =
    briefing.highlights.length > 0
      ? briefing.highlights.join(" · ")
      : briefing.body.slice(0, 220);

  const inserted = await recordProactiveFeedEvent(
    supabase,
    userId,
    eventKey,
    briefing.title,
    feedBody,
    chatUrl,
    { push: opts?.push !== false },
  );

  return { created: true, pushed: inserted };
}

export async function runDailyBriefingBatch(
  supabase: SupabaseClient,
  opts?: { maxUsers?: number },
): Promise<DailyBriefingSummary> {
  const maxUsers = opts?.maxUsers ?? 40;
  const errors: string[] = [];
  let briefingsCreated = 0;
  let pushesSent = 0;

  const seen = new Set<string>();
  const userIds: string[] = [];

  const { data: pushUsers } = await supabase
    .from("push_subscriptions")
    .select("user_id")
    .limit(maxUsers * 3);

  for (const row of pushUsers ?? []) {
    const id = row.user_id as string;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    userIds.push(id);
    if (userIds.length >= maxUsers) break;
  }

  if (userIds.length < maxUsers) {
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { data: activeUsers } = await supabase
      .from("messages")
      .select("user_id")
      .gte("created_at", since)
      .limit(maxUsers * 2);

    for (const row of activeUsers ?? []) {
      const id = row.user_id as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      userIds.push(id);
      if (userIds.length >= maxUsers) break;
    }
  }

  for (const userId of userIds) {
    try {
      const result = await runDailyBriefingForUser(supabase, userId);
      if (result.created) briefingsCreated += 1;
      if (result.pushed) pushesSent += 1;
    } catch (e) {
      errors.push(`${userId}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return {
    usersChecked: userIds.length,
    briefingsCreated,
    pushesSent,
    errors,
  };
}
