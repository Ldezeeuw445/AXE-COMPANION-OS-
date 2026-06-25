/**
 * AXE Daily Briefing Service
 *
 * Generates personalized morning briefs for traders based on:
 * - Trader profile (name, timezone, preferences from profiles table)
 * - Trading history (top pairs, recent wins from broker_trades)
 * - Alignment score (learning arc)
 * - Market context (session time, personalized pair focus)
 *
 * Saves results to axe_daily_briefings so the cockpit can surface them.
 */

import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { callLLM, type LLMRequest } from "@/services/llmClient";
import { getTraderLearningArc } from "@/services/learningArcService";
import { trackAdaptiveEvent } from "@/services/trackAdaptiveEvent";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraderBriefingContext {
  traderId: string;
  name: string;
  timezone: string;
  preferredPairs: string[];
  alignment: number; // 0-100
  recentWins: Array<{ pair: string; timeframe: string; gain: number }>;
  topIndicators: string[];
  preferredSession: "london" | "newyork" | "asia";
}

// ─── Profile fetch (service-role, no relative URLs) ───────────────────────────

async function fetchProfileDirect(
  supabase: SupabaseClient,
  userId: string
): Promise<{ displayName: string; timezone: string }> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, timezone")
      .eq("id", userId)
      .maybeSingle();
    return {
      displayName: data?.display_name ?? "Trader",
      timezone: data?.timezone ?? "Europe/Amsterdam",
    };
  } catch {
    return { displayName: "Trader", timezone: "Europe/Amsterdam" };
  }
}

// ─── Build briefing context from Supabase ────────────────────────────────────

export async function buildBriefingContext(
  supabase: SupabaseClient,
  traderId: string
): Promise<TraderBriefingContext> {
  try {
    const [profile, arc] = await Promise.all([
      fetchProfileDirect(supabase, traderId),
      getTraderLearningArc(traderId, supabase),
    ]);

    const tzDate = new Date(
      new Date().toLocaleString("en-US", { timeZone: profile.timezone })
    );
    const hour = tzDate.getHours();

    let session: "london" | "newyork" | "asia" = "asia";
    if (hour >= 7 && hour < 16) session = "london";
    if (hour >= 14 && hour < 23) session = "newyork";

    return {
      traderId,
      name: profile.displayName,
      timezone: profile.timezone,
      preferredPairs: arc.topPairs.slice(0, 3),
      alignment: arc.alignmentScore,
      recentWins: arc.recentWins.slice(0, 3),
      topIndicators: arc.topIndicators.slice(0, 3),
      preferredSession: session,
    };
  } catch (error) {
    console.error("[Briefing] Failed to build context:", error);
    return {
      traderId,
      name: "Trader",
      timezone: "Europe/Amsterdam",
      preferredPairs: [],
      alignment: 0,
      recentWins: [],
      topIndicators: [],
      preferredSession: "london",
    };
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildBriefingPrompt(context: TraderBriefingContext): string {
  const timeStr = new Date().toLocaleString("en-US", {
    timeZone: context.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "long",
  });

  const hasPairs = context.preferredPairs.length > 0;
  const hasWins = context.recentWins.length > 0;

  let prompt = `You are AXE — a warm, sharp trading companion. Generate a personalized morning brief for ${context.name}.

Key facts:
- Their local time: ${timeStr} (${context.timezone})
- Top pairs: ${hasPairs ? context.preferredPairs.join(", ") : "not yet identified — be encouraging"}
- AXE alignment score: ${context.alignment}% (how well AXE has learned this trader's style)
- Session focus: ${context.preferredSession}
- Key indicators they use: ${context.topIndicators.length > 0 ? context.topIndicators.join(", ") : "standard set"}`;

  if (hasWins) {
    prompt += `\n\nRecent profitable trades:`;
    for (const win of context.recentWins) {
      prompt += `\n- ${win.pair} on ${win.timeframe}: +${win.gain.toFixed(1)}%`;
    }
  }

  prompt += `

Write a morning brief that:
1. Opens with a greeting that uses ${context.name}'s name and the local time/day
2. Calls out 1-2 specific pairs or session setups worth watching today
3. References their alignment score in a motivating way (e.g. "${context.alignment}% aligned — AXE is starting to read your edge")
4. Includes one tactical insight tied to their style or recent history
5. Ends with one clear, actionable thing to watch for this session

Tone: warm, direct, confident. Like a senior trader who actually knows them. No generic textbook talk.
Length: 150-200 words maximum.`;

  return prompt;
}

// ─── Generate brief and save to DB ───────────────────────────────────────────

export async function generateMorningBrief(
  traderId: string,
  supabase?: SupabaseClient
): Promise<{
  brief: string;
  context: TraderBriefingContext;
  model: string;
  provider: "ollama" | "openai";
  latency_ms: number;
}> {
  const startTime = Date.now();

  // Use provided supabase or create service role client
  const sb = supabase ?? createServiceRoleSupabaseClient();
  if (!sb) throw new Error("Supabase service role client unavailable");

  // Build context
  const context = await buildBriefingContext(sb, traderId);

  // Build prompt
  const userPrompt = buildBriefingPrompt(context);

  // Call LLM
  const llmRequest: LLMRequest = {
    messages: [
      {
        role: "system",
        content:
          "You are AXE Companion, a warm and intelligent AI trading partner. Write concise, personal, actionable morning briefs.",
      },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 350,
  };

  const response = await callLLM(llmRequest, "intel");
  const latency_ms = Date.now() - startTime;

  console.log(
    `[Briefing] Generated for ${traderId} in ${latency_ms}ms via ${response.provider}`
  );

  const briefText = response.content ?? "";
  const today = new Date().toISOString().slice(0, 10);

  // Save to axe_daily_briefings (upsert by user_id + date)
  try {
    await sb.from("axe_daily_briefings").upsert(
      {
        user_id: traderId,
        briefing_date: today,
        title: `Morning Brief — ${new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "short",
          timeZone: context.timezone,
        })}`,
        body: briefText,
        highlights: context.preferredPairs.length
          ? context.preferredPairs.map((p) => ({ pair: p }))
          : [],
        chat_prefill: `AXE, tell me more about today's setup for ${
          context.preferredPairs[0] ?? "the market"
        }`,
      },
      { onConflict: "user_id,briefing_date" }
    );
    console.log(`[Briefing] Saved to axe_daily_briefings for ${traderId}`);
  } catch (err) {
    console.warn("[Briefing] Failed to save to DB:", err);
  }

  // Track event (best-effort)
  try {
    await trackAdaptiveEvent({
      accountId: null,
      eventType: "morning_brief_delivered",
      route: "/cockpit",
      payload: {
        traderId,
        alignment: context.alignment,
        topPairs: context.preferredPairs,
      },
      occurredAt: new Date().toISOString(),
    });
  } catch {
    // Non-blocking
  }

  return {
    brief: briefText,
    context,
    model: response.model,
    provider: response.provider,
    latency_ms,
  };
}

// ─── Get today's brief for a user ────────────────────────────────────────────

export async function getTodaysBrief(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  title: string;
  body: string;
  highlights: Array<{ pair?: string; [k: string]: unknown }>;
  chat_prefill: string;
  briefing_date: string;
} | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("axe_daily_briefings")
      .select("title, body, highlights, chat_prefill, briefing_date")
      .eq("user_id", userId)
      .eq("briefing_date", today)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

// ─── Fetch all users opted into daily briefing ───────────────────────────────

async function getTraderIdsForBriefing(
  supabase: SupabaseClient
): Promise<string[]> {
  try {
    // All users who have a profile — everyone gets a brief by default.
    // Respect opt-out: preferences->>'morningBriefingOptIn' = 'false' skips.
    const { data, error } = await supabase
      .from("profiles")
      .select("id, preferences")
      .limit(500);

    if (error || !data) {
      console.warn("[Briefing] Could not fetch profiles:", error?.message);
      return [];
    }

    return data
      .filter((row) => {
        const prefs =
          typeof row.preferences === "object" && row.preferences !== null
            ? (row.preferences as Record<string, unknown>)
            : {};
        // Only skip if explicitly opted out
        return prefs.morningBriefingOptIn !== false;
      })
      .map((row) => row.id as string);
  } catch (err) {
    console.error("[Briefing] getTraderIdsForBriefing error:", err);
    return [];
  }
}

// ─── Daily cron entry point ───────────────────────────────────────────────────

export async function runDailyBriefingCron(): Promise<{
  processed: number;
  failed: number;
  latency_ms: number;
}> {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    console.error("[Briefing] Service role client unavailable — aborting cron");
    return { processed: 0, failed: 0, latency_ms: Date.now() - startTime };
  }

  const traders = await getTraderIdsForBriefing(supabase);
  console.log(`[Briefing] Cron starting for ${traders.length} traders`);

  for (const traderId of traders) {
    try {
      await generateMorningBrief(traderId, supabase);
      processed++;
    } catch (error) {
      console.error(`[Briefing] Failed for trader ${traderId}:`, error);
      failed++;
    }
  }

  const latency_ms = Date.now() - startTime;
  console.log(
    `[Briefing] Cron complete: ${processed} processed, ${failed} failed in ${latency_ms}ms`
  );

  return { processed, failed, latency_ms };
}

export type { TraderBriefingContext as BriefingContext };
