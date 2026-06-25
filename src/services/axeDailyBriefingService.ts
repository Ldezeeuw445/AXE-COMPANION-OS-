/**
 * AXE Daily Briefing Service
 * 
 * Generates personalized morning briefs for traders based on:
 * - Trader profile (name, timezone, preferences)
 * - Trading history (top pairs, recent wins)
 * - Alignment score (how well AXE matches trader)
 * - Market context (weather, calendar, macros)
 * - Learning arc (personalization over time)
 */

import { callLLM, type LLMRequest } from '@/services/llmClient';
import { getTraderProfile } from '@/services/profileEngine';
import { getTraderLearningArc } from '@/services/learningArcService';
import { trackAdaptiveEvent } from '@/services/trackAdaptiveEvent';

interface TraderBriefingContext {
  traderId: string;
  name: string;
  timezone: string;
  preferredPairs: string[];
  alignment: number; // 0-100
  recentWins: Array<{ pair: string; timeframe: string; gain: number }>;
  topIndicators: string[];
  preferredSession: 'london' | 'newyork' | 'asia';
  shouldIncludeWeather: boolean;
  weather?: {
    condition: string;
    temp: number;
    location: string;
  };
  macro?: {
    events: string[];
    risks: string[];
  };
}

/**
 * Fetch trader profile and context from Supabase
 */
export async function buildBriefingContext(traderId: string): Promise<TraderBriefingContext> {
  try {
    // Get trader profile
    const profile = await getTraderProfile(traderId);
    
    // Get learning arc data
    const arc = await getTraderLearningArc(traderId);

    // Get local time
    const now = new Date();
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: profile.timezone }));
    const hour = tzDate.getHours();

    // Determine session
    let session: 'london' | 'newyork' | 'asia' = 'asia';
    if (hour >= 7 && hour < 15) session = 'london'; // 8-4pm London time
    if (hour >= 14 && hour < 22) session = 'newyork'; // 9-5pm NY time

    // Get weather if opted in
    let weather: TraderBriefingContext['weather'] | undefined;
    if (profile.preferences.weatherOptIn && profile.location) {
      weather = await getWeatherForLocation(profile.location);
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
      shouldIncludeWeather: profile.preferences.weatherOptIn,
      weather,
    };
  } catch (error) {
    console.error('[Briefing] Failed to build context:', error);
    // Return minimal context with defaults
    return {
      traderId,
      name: 'Trader',
      timezone: 'UTC',
      preferredPairs: [],
      alignment: 0,
      recentWins: [],
      topIndicators: [],
      preferredSession: 'asia',
      shouldIncludeWeather: false,
    };
  }
}

/**
 * Fetch weather for a location (placeholder - integrate with real weather API)
 */
async function getWeatherForLocation(
  location: string
): Promise<{ condition: string; temp: number; location: string }> {
  // TODO: Integrate with OpenWeatherMap or similar
  return {
    location,
    condition: 'Partly cloudy',
    temp: 20,
  };
}

/**
 * Build the AXE morning brief prompt
 */
function buildBriefingPrompt(context: TraderBriefingContext): string {
  const timeStr = new Date().toLocaleString('en-US', {
    timeZone: context.timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  let prompt = `You are AXE Companion, generating a personalized morning trading brief for ${context.name}.

Key information:
- Local time: ${timeStr} (${context.timezone})
- Top trading pairs: ${context.preferredPairs.join(', ') || 'Not yet identified'}
- Alignment score: ${context.alignment}% (how well AXE matches this trader's style)
- Focus session: ${context.preferredSession}
- Preferred timeframes: Based on recent wins
- Key indicators: ${context.topIndicators.join(', ') || 'Standard set'}`;

  if (context.recentWins.length > 0) {
    prompt += `\n\nRecent wins:`;
    for (const win of context.recentWins) {
      prompt += `\n- ${win.pair} on ${win.timeframe}: +${win.gain}%`;
    }
  }

  if (context.shouldIncludeWeather && context.weather) {
    prompt += `\n\nWeather: ${context.weather.condition}, ${context.weather.temp}°C in ${context.weather.location}`;
  }

  prompt += `

Your brief should:
1. Open with a friendly, personalized greeting (use ${context.name})
2. Call out the time and timezone (so they know it's for them)
3. Highlight the top 2-3 pairs for this session
4. Reference their alignment score in a motivating way
5. Include one tactical insight tied to their recent wins
6. Close with something encouraging and actionable

Keep it under 200 words. Use AXE's voice: warm, intelligent, direct. Occasional trading humor is fine.`;

  return prompt;
}

/**
 * Generate the morning brief
 */
export async function generateMorningBrief(traderId: string): Promise<{
  brief: string;
  context: TraderBriefingContext;
  model: string;
  provider: 'ollama' | 'openai';
  latency_ms: number;
}> {
  const startTime = Date.now();

  try {
    // Build context
    const context = await buildBriefingContext(traderId);

    // Build prompt
    const userPrompt = buildBriefingPrompt(context);

    // Call LLM (intel model for better quality)
    const llmRequest: LLMRequest = {
      messages: [
        {
          role: 'system',
          content: 'You are AXE Companion, a warm and intelligent AI trading partner.',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.8, // Slightly higher for personality
      max_tokens: 300,
    };

    const response = await callLLM(llmRequest, 'intel');
    const latency_ms = Date.now() - startTime;

    console.log(`[Briefing] Generated for ${traderId} in ${latency_ms}ms via ${response.provider}`);

    // Track the event
    try {
      await trackAdaptiveEvent({
        accountId: null,
        eventType: 'morning_brief_delivered',
        route: '/cockpit',
        payload: {
          traderId,
          alignment: context.alignment,
          topPairs: context.preferredPairs,
        },
        occurredAt: new Date().toISOString(),
      });
    } catch (e) {
      // Event tracking is best-effort
      console.warn('[Briefing] Failed to track event:', e);
    }

    return {
      brief: response.content,
      context,
      model: response.model,
      provider: response.provider,
      latency_ms,
    };
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    console.error(`[Briefing] Error after ${latency_ms}ms:`, error);
    throw error;
  }
}

/**
 * Deliver brief via email (integrates with email service)
 */
export async function deliverBriefViaEmail(
  traderId: string,
  brief: string,
  context: TraderBriefingContext
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // TODO: Integrate with SendGrid or similar
    // For now, just log
    console.log(`[Briefing] Would send to trader: ${context.name} at ${context.timezone}`);
    console.log(`[Briefing] Brief: ${brief.slice(0, 100)}...`);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Briefing] Email delivery failed:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Daily briefing cron job
 * Should be called via /api/cron/daily-briefing (Vercel Cron)
 */
export async function runDailyBriefingCron(): Promise<{
  processed: number;
  failed: number;
  latency_ms: number;
}> {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  try {
    // Fetch all traders who opted into daily briefing
    // TODO: Query Supabase for traders with morningBriefingOptIn = true
    const traders = await getTraderIdsForBriefing();

    for (const traderId of traders) {
      try {
        const result = await generateMorningBrief(traderId);
        await deliverBriefViaEmail(traderId, result.brief, result.context);
        processed++;
      } catch (error) {
        console.error(`[Briefing] Failed for trader ${traderId}:`, error);
        failed++;
      }
    }

    const latency_ms = Date.now() - startTime;
    console.log(`[Briefing] Cron complete: ${processed} processed, ${failed} failed in ${latency_ms}ms`);

    return { processed, failed, latency_ms };
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    console.error('[Briefing] Cron failed:', error);
    throw error;
  }
}

/**
 * Fetch trader IDs who opted into morning briefing
 * TODO: Implement actual Supabase query
 */
async function getTraderIdsForBriefing(): Promise<string[]> {
  // SELECT user_id FROM global_preferences WHERE morning_briefing_opt_in = true;
  return [];
}

// Export types
export type { TraderBriefingContext };
