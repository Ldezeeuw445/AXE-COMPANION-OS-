/**
 * GET/POST /api/cron/krater-feed-sync
 *
 * Generates broadcast feed content via Krater Chat API (default) and upserts
 * into axe_broadcast_feed for the AXE Feed broadcast tabs.
 *
 * Note: Krater developer API (kr_live_) does NOT expose scheduled-task or
 * conversation history endpoints (404). Use KRATER_SYNC_MODE=generate (default).
 *
 * Runs every 10 min; only syncs during 07:00–07:29 and 20:00–20:29 Europe/Amsterdam.
 * Secured with CRON_SECRET (same key as other AXE crons).
 *
 * Env:
 * - KRATER_API_KEY
 * - KRATER_SYNC_MODE=generate|poll (default generate)
 * - KRATER_BROADCAST_MODEL (default google/gemini-2.5-flash)
 */
import { NextRequest, NextResponse } from "next/server";
import { runKraterFeedSync } from "@/services/kraterFeedSyncRunner";
import {
  getKraterSyncMode,
  probeKraterBroadcastSource,
  probeKraterGenerate,
  type KraterBroadcastType,
} from "@/services/kraterFeedSyncService";
import type { BroadcastType } from "@/services/broadcastFeedService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  return Boolean(secret && auth === `Bearer ${secret}`);
}

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
  const debug = request.nextUrl.searchParams.get("debug") === "1";
  const types = parseTypesParam(request.nextUrl.searchParams.get("types"));

  if (debug) {
    const selected = types ?? (["daily_news", "market_recap"] as BroadcastType[]);
    const syncMode = getKraterSyncMode();
    const generateProbe = await probeKraterGenerate(
      (selected[0] ?? "daily_news") as KraterBroadcastType,
    );
    const pollProbes =
      syncMode === "poll"
        ? await Promise.all(
            selected.map((type) => probeKraterBroadcastSource(type as KraterBroadcastType)),
          )
        : [];

    return NextResponse.json({
      status: "debug",
      hasKraterApiKey: Boolean(process.env.KRATER_API_KEY?.trim()),
      syncMode,
      note:
        syncMode === "generate"
          ? "Generate mode is active. Poll probes are skipped. Use ?force=1 to write feed items."
          : "Poll mode is active. Scheduled-task/conversation endpoints may not exist on kr_live_ API.",
      generateProbe,
      pollProbes,
      latency_ms: Date.now() - start,
    });
  }

  try {
    const results = await runKraterFeedSync({ force, types });
    return NextResponse.json({
      status: "success",
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
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleSync(request);
}
