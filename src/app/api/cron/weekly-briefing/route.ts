/**
 * POST /api/cron/weekly-briefing
 *
 * Vercel Cron runs hourly on Sundays; processes users whose local time is 21:00
 * (Sunday evening — FX weekend close + crypto week framing). Paid tiers only.
 */

import { NextRequest, NextResponse } from "next/server";
import { runWeeklyBriefingCron } from "@/services/axeDailyBriefingService";

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn("[Cron] Unauthorized weekly briefing request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Cron] Weekly briefing started");
    const result = await runWeeklyBriefingCron();
    const latency_ms = Date.now() - startTime;

    return NextResponse.json({
      status: "success",
      processed: result.processed,
      failed: result.failed,
      latency_ms,
    });
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Cron] Weekly briefing failed after ${latency_ms}ms:`, errorMessage);
    return NextResponse.json(
      { status: "error", error: errorMessage, latency_ms },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/weekly-briefing (manual test)
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const isLocal = origin?.includes("localhost") || origin?.includes("127.0.0.1");
  const authHeader = request.headers.get("Authorization");
  const isAdmin = authHeader?.startsWith("Bearer ");

  if (!isLocal && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const testTraderId = request.nextUrl.searchParams.get("traderId") || "test-trader-123";

  try {
    const { generateMorningBrief } = await import("@/services/axeDailyBriefingService");
    const result = await generateMorningBrief(testTraderId, undefined, { weekly: true });

    return NextResponse.json({
      status: "success",
      brief: result.brief,
      context: result.context,
      model: result.model,
      provider: result.provider,
      latency_ms: result.latency_ms,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", error: errorMessage }, { status: 500 });
  }
}
