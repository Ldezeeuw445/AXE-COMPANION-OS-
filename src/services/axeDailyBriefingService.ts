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
import { fetchWeatherForBrief, type WeatherSnapshot } from "@/services/weatherService";
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
  tier: "free" | "pro" | "founder" | "elite";
  weather: WeatherSnapshot | null;
  preferences: Record<string, unknown>;
}

// ─── Profile fetch (service-role, no relative URLs) ───────────────────────────

type ProfileBrief = {
  displayName: string;
  timezone: string;
  preferences: Record<string, unknown>;
  tier: "free" | "pro" | "founder" | "elite";
};

async function fetchProfileDirect(supabase: SupabaseClient, userId: string): Promise<ProfileBrief> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, timezone, preferences")
      .eq("id", userId)
      .maybeSingle();

    const entitlements = await supabase
      .from("axe_user_entitlements")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();

    const prefs =
      data?.preferences && typeof data.preferences === "object"
        ? (data.preferences as Record<string, unknown>)
        : {};

    return {
      displayName: data?.display_name ?? "Trader",
      timezone: data?.timezone ?? "Europe/Amsterdam",
      preferences: prefs,
      tier: (entitlements.data?.plan as ProfileBrief["tier"]) ?? "free",
    };
  } catch {
    return {
      displayName: "Trader",
      timezone: "Europe/Amsterdam",
      preferences: {},
      tier: "free",
    };
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

    // Fetch weather only when user opted in
    let weather: WeatherSnapshot | null = null;
    if (profile.preferences.weatherOptIn === true && profile.preferences.locationOptIn === true) {
      const loc = profile.preferences.location as
        | { lat?: number; lon?: number; name?: string }
        | undefined;
      weather = await fetchWeatherForBrief(loc, profile.timezone);
    }

    return {
      traderId,
      name: profile.displayName,
      timezone: profile.timezone,
      preferredPairs: arc.topPairs.slice(0, 3),
      alignment: arc.alignmentScore,
      recentWins: arc.recentWins.slice(0, 3),
      topIndicators: arc.topIndicators.slice(0, 3),
      preferredSession: session,
      tier: profile.tier,
      weather,
      preferences: profile.preferences,
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
      tier: "free",
      weather: null,
      preferences: {},
    };
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildBriefingPrompt(context: TraderBriefingContext, options?: { weekly?: boolean }): string {
  const timeStr = new Date().toLocaleString("en-US", {
    timeZone: context.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "long",
  });

  const hasPairs = context.preferredPairs.length > 0;
  const hasWins = context.recentWins.length > 0;
  const isWeekly = options?.weekly ?? false;

  let prompt = `You are AXE — a warm, sharp trading companion. Generate a ${isWeekly ? "personalized weekly outlook" : "personalized morning brief"} for ${context.name}.

Key facts:
- Their local time: ${timeStr} (${context.timezone})
- Tier: ${context.tier}
- Top pairs: ${hasPairs ? context.preferredPairs.join(", ") : "not yet identified — be encouraging"}
- AXE alignment score: ${context.alignment}% (how well AXE has learned this trader's style)
- Session focus: ${context.preferredSession}
- Key indicators they use: ${context.topIndicators.length > 0 ? context.topIndicators.join(", ") : "standard set"}`;

  if (context.weather) {
    prompt += `\n- Weather in ${context.weather.location}: ${context.weather.summary}, ${context.weather.tempC}°C, wind ${context.weather.windKmh} km/h`;
  }

  if (hasWins) {
    prompt += `\n\nRecent profitable trades:`;
    for (const win of context.recentWins) {
      prompt += `\n- ${win.pair} on ${win.timeframe}: +${win.gain.toFixed(1)}%`;
    }
  }

  if (isWeekly) {
    prompt += `

Write a weekly outlook that:
1. Opens with a greeting that uses ${context.name}'s name and frames the week ahead
2. Calls out 2-3 high-probability setups or macro themes for the week
3. References their tier (${context.tier}) and alignment score in a motivating way
4. Includes one tactical insight tied to their preferred session or recent winners
5. Ends with the single most important thing to watch this week

Tone: warm, direct, confident. Like a senior trader who actually knows them. No generic textbook talk.
Length: 200-280 words maximum.`;
  } else {
    prompt += `

Write a morning brief that:
1. Opens with a greeting that uses ${context.name}'s name and the local time/day
2. Calls out 1-2 specific pairs or session setups worth watching today
3. References their alignment score in a motivating way (e.g. "${context.alignment}% aligned — AXE is starting to read your edge")
4. Includes one tactical insight tied to their style or recent history
5. Ends with one clear, actionable thing to watch for this session

Tone: warm, direct, confident. Like a senior trader who actually knows them. No generic textbook talk.
Length: 150-200 words maximum.`;
  }

  return prompt;
}

// ─── Generate brief and save to DB ───────────────────────────────────────────

export async function generateMorningBrief(
  traderId: string,
  supabase?: SupabaseClient,
  options?: { weekly?: boolean; save?: boolean }
): Promise<{
  brief: string;
  context: TraderBriefingContext;
  model: string;
  provider: "ollama" | "openai";
  latency_ms: number;
}> {
  const startTime = Date.now();
  const isWeekly = options?.weekly ?? false;
  const shouldSave = options?.save ?? true;

  // Use provided supabase or create service role client
  const sb = supabase ?? createServiceRoleSupabaseClient();
  if (!sb) throw new Error("Supabase service role client unavailable");

  // Build context
  const context = await buildBriefingContext(sb, traderId);

  // Build prompt
  const userPrompt = buildBriefingPrompt(context, { weekly: isWeekly });

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

  // Save to axe_daily_briefings (upsert by user_id + date + type)
  if (shouldSave) {
    try {
      await sb.from("axe_daily_briefings").upsert(
        {
          user_id: traderId,
          briefing_date: today,
          briefing_type: isWeekly ? "weekly" : "daily",
          title: isWeekly
            ? `Weekly Outlook — ${new Date().toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "short",
                timeZone: context.timezone,
              })}`
            : `Morning Brief — ${new Date().toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "short",
                timeZone: context.timezone,
              })}`,
          body: briefText,
          highlights: context.preferredPairs.length
            ? context.preferredPairs.map((p) => ({ pair: p }))
            : [],
          chat_prefill: isWeekly
            ? `AXE, walk me through this week's outlook for ${
                context.preferredPairs[0] ?? "the market"
              }`
            : `AXE, tell me more about today's setup for ${
                context.preferredPairs[0] ?? "the market"
              }`,
          feed_url: "/feed",
        },
        { onConflict: "user_id,briefing_date,briefing_type" }
      );
      console.log(`[Briefing] Saved ${isWeekly ? "weekly" : "daily"} brief to axe_daily_briefings for ${traderId}`);
    } catch (err) {
      console.warn("[Briefing] Failed to save to DB:", err);
    }
  }

  // Also insert the brief into the user's AXE conversation as an assistant message
  try {
    // Ensure the user's primary AXE conversation exists
    const { data: convs } = await sb
      .from("conversations")
      .select("id")
      .eq("user_id", traderId)
      .or("conversation_type.eq.axe,conversation_type.is.null")
      .order("last_message_at", { ascending: false })
      .limit(1);

    const convId = Array.isArray(convs) && convs.length > 0 ? (convs[0] as any).id : null;
    if (convId) {
      const { error: msgErr } = await sb.from("messages").insert({
        conversation_id: convId,
        user_id: traderId,
        role: "assistant",
        content: briefText,
        metadata: { automated_brief: true },
      });
      if (msgErr) console.warn("[Briefing] failed to insert message into conversation:", msgErr.message);

      await sb
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", convId)
        .eq("user_id", traderId);
    }
  } catch (err) {
    console.warn("[Briefing] failed to append brief to chat:", err);
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
  userId: string,
  type: "daily" | "weekly" = "daily"
): Promise<{
  title: string;
  body: string;
  highlights: Array<{ pair?: string; [k: string]: unknown }>;
  chat_prefill: string;
  briefing_date: string;
  feed_url: string;
  briefing_type: string;
} | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("axe_daily_briefings")
      .select("title, body, highlights, chat_prefill, briefing_date, feed_url, briefing_type")
      .eq("user_id", userId)
      .eq("briefing_date", today)
      .eq("briefing_type", type)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

// ─── Fetch all users opted into daily briefing ───────────────────────────────

async function getTraderIdsForBriefing(
  supabase: SupabaseClient,
  opts?: { targetHour?: number; weekly?: boolean }
): Promise<string[]> {
  try {
    const targetHour = opts?.targetHour ?? 7;
    const isWeekly = opts?.weekly ?? false;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, preferences, timezone")
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
        // Skip if explicitly opted out
        if (prefs.morningBriefingOptIn === false) return false;

        // Timezone-aware hour check: only process users whose local time is the target hour
        const tz = (row.timezone as string) || "Europe/Amsterdam";
        try {
          const localHour = parseInt(
            new Date().toLocaleString("en-US", {
              timeZone: tz,
              hour: "numeric",
              hour12: false,
            }),
            10
          );
          if (localHour !== targetHour) return false;
        } catch {
          // Unknown timezone — fall through to UTC hour match
          if (new Date().getUTCHours() !== targetHour) return false;
        }

        return true;
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

  // Run every hour but only process users whose local time is 07:00
  const traders = await getTraderIdsForBriefing(supabase, { targetHour: 7 });
  console.log(`[Briefing] Daily cron starting for ${traders.length} traders`);

  for (const traderId of traders) {
    try {
      await generateMorningBrief(traderId, supabase, { weekly: false });
      processed++;
    } catch (error) {
      console.error(`[Briefing] Failed for trader ${traderId}:`, error);
      failed++;
    }
  }

  const latency_ms = Date.now() - startTime;
  console.log(
    `[Briefing] Daily cron complete: ${processed} processed, ${failed} failed in ${latency_ms}ms`
  );

  return { processed, failed, latency_ms };
}

// ─── Weekly cron entry point ──────────────────────────────────────────────────

export async function runWeeklyBriefingCron(): Promise<{
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

  // Monday 07:00 local time. Only paid tiers get the weekly outlook.
  const traders = await getTraderIdsForBriefing(supabase, { targetHour: 7, weekly: true });
  console.log(`[Briefing] Weekly cron starting for ${traders.length} traders`);

  for (const traderId of traders) {
    try {
      const brief = await generateMorningBrief(traderId, supabase, { weekly: true });
      if (["pro", "founder", "elite"].includes(brief.context.tier)) {
        processed++;
      }
    } catch (error) {
      console.error(`[Briefing] Failed for trader ${traderId}:`, error);
      failed++;
    }
  }

  const latency_ms = Date.now() - startTime;
  console.log(
    `[Briefing] Weekly cron complete: ${processed} processed, ${failed} failed in ${latency_ms}ms`
  );

  return { processed, failed, latency_ms };
}

export type { TraderBriefingContext as BriefingContext };
