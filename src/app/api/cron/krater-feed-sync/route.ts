/**
 * GET/POST /api/cron/krater-feed-sync
 *
 * Writes the two broadcast feed items — Daily News and Market Recap — into
 * axe_broadcast_feed for the AXE Feed tabs.
 *
 * The name is historical. Krater was removed on 2026-10-11: its API key had
 * never been set on this host, the local generator was already doing the work,
 * and the scheduled-task and conversation endpoints the old code polled did not
 * exist on the kr_live_ API. The path stays because a registered pg_cron job
 * and an axe_ops.cron_job row point at it, and renaming those out of step with
 * a deploy leaves the feed silent for a day. See services/broadcastSyncService.
 *
 * Runs every 10 min; only writes during 07:00–07:29 and 20:00–20:29
 * Europe/Amsterdam. Secured with CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { hasCronSecret } from "@/lib/auth/cronSecret";
import { runKraterFeedSync } from "@/services/kraterFeedSyncRunner";
import type { BroadcastType } from "@/services/broadcastFeedService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseTypesParam(raw: string | null): BroadcastType[] | undefined {
  if (!raw) return undefined;
  const types = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is BroadcastType => s === "daily_news" || s === "market_recap");
  return types.length > 0 ? types : undefined;
}

async function handleSync(request: NextRequest) {
  const start = Date.now();
  const force = request.nextUrl.searchParams.get("force") === "1";
  const types = parseTypesParam(request.nextUrl.searchParams.get("types"));

  try {
    const results = await runKraterFeedSync({ force, types });
    return NextResponse.json({
      status: "success",
      source: "axe_local",
      results,
      latency_ms: Date.now() - start,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { status: "error", error: message, latency_ms: Date.now() - start },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  if (!hasCronSecret(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  if (!hasCronSecret(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleSync(request);
}
