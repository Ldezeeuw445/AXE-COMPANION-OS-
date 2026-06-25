/**
 * POST /api/cron/daily-briefing
 * 
 * Vercel Cron function that runs daily to generate and deliver briefings.
 * 
 * Configuration:
 * In vercel.json:
 * ```
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/daily-briefing",
 *       "schedule": "0 8 * * *"  // 8 AM UTC daily
 *     }
 *   ]
 * }
 * ```
 * 
 * The schedule should be adjusted per timezone group:
 * - 8 AM UTC = 9 AM London, 3 AM New York, 4 PM Tokyo
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDailyBriefingCron } from '@/services/axeDailyBriefingService';

/**
 * POST /api/cron/daily-briefing
 * 
 * Vercel will POST to this endpoint according to the cron schedule.
 * Verify the request is from Vercel using the Authorization header.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify this is a Vercel cron request
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn('[Cron] Unauthorized cron request');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Cron] Daily briefing started');

    // Run the briefing job
    const result = await runDailyBriefingCron();

    const latency_ms = Date.now() - startTime;
    console.log(`[Cron] Completed: ${result.processed} processed, ${result.failed} failed in ${latency_ms}ms`);

    return NextResponse.json({
      status: 'success',
      processed: result.processed,
      failed: result.failed,
      latency_ms,
    });
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[Cron] Failed after ${latency_ms}ms:`, errorMessage);

    return NextResponse.json(
      {
        status: 'error',
        error: errorMessage,
        latency_ms,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/daily-briefing (for manual testing)
 */
export async function GET(request: NextRequest) {
  // Only allow from localhost or admin
  const origin = request.headers.get('origin');
  const isLocal = origin?.includes('localhost') || origin?.includes('127.0.0.1');
  const authHeader = request.headers.get('Authorization');
  const isAdmin = authHeader?.startsWith('Bearer ');

  if (!isLocal && !isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Run a single briefing for a test trader
  const testTraderId = request.nextUrl.searchParams.get('traderId') || 'test-trader-123';

  try {
    const { generateMorningBrief } = await import('@/services/axeDailyBriefingService');
    const result = await generateMorningBrief(testTraderId);

    return NextResponse.json({
      status: 'success',
      brief: result.brief,
      context: result.context,
      model: result.model,
      provider: result.provider,
      latency_ms: result.latency_ms,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { status: 'error', error: errorMessage },
      { status: 500 }
    );
  }
}
