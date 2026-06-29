/**
 * GET/POST /api/cron/weekly-briefing
 *
 * Vercel Cron invokes GET hourly on Mondays; processes users at 07:00 local.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateMorningBrief,
  runWeeklyBriefingCron,
} from "@/services/axeDailyBriefingService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  return Boolean(secret && auth === `Bearer ${secret}`);
}

async function handleWeeklyBriefingCron() {
  const startTime = Date.now();

  try {
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
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  if (isCronAuthorized(request)) {
    return handleWeeklyBriefingCron();
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

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleWeeklyBriefingCron();
}
