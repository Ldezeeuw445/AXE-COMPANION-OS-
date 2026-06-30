/**
 * GET/POST /api/cron/daily-briefing
 *
 * Vercel Cron invokes this path every 15 min (04:00–11:00 UTC); pre-generates at 06:00 local.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateMorningBrief,
  runDailyBriefingCron,
} from "@/services/axeDailyBriefingService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  return Boolean(secret && auth === `Bearer ${secret}`);
}

async function handleDailyBriefingCron() {
  const startTime = Date.now();

  try {
    console.log("[Cron] Daily briefing started");
    const result = await runDailyBriefingCron();
    const latency_ms = Date.now() - startTime;
    console.log(
      `[Cron] Completed: ${result.processed} processed, ${result.failed} failed in ${latency_ms}ms`,
    );

    return NextResponse.json({
      status: "success",
      processed: result.processed,
      failed: result.failed,
      latency_ms,
    });
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Cron] Failed after ${latency_ms}ms:`, errorMessage);
    return NextResponse.json(
      { status: "error", error: errorMessage, latency_ms },
      { status: 500 },
    );
  }
}

/** Vercel Cron uses GET — this is the production entry point. */
export async function GET(request: NextRequest) {
  if (isCronAuthorized(request)) {
    return handleDailyBriefingCron();
  }

  const origin = request.headers.get("origin");
  const isLocal = origin?.includes("localhost") || origin?.includes("127.0.0.1");
  if (!isLocal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const testTraderId = request.nextUrl.searchParams.get("traderId");
  if (!testTraderId) {
    return NextResponse.json(
      { error: "Local test requires ?traderId=<uuid>" },
      { status: 400 },
    );
  }

  try {
    const result = await generateMorningBrief(testTraderId);
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

/** POST alias for manual triggers with CRON_SECRET. */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleDailyBriefingCron();
}
