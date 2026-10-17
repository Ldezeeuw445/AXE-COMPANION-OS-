import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { publishChartEvent } from "@/lib/chart/attachChartWebSocket";
import type { ChartLiveEvent } from "@/lib/chart/liveContract";

/**
 * Shared handler for streamer pushes.
 *
 * Two paths reach it: `/internal/publish`, which is the address the deployed
 * streamer posts to (it was written against the Cloudflare worker, whose route
 * has no `/api` prefix), and `/api/internal/chart-publish`, which is where a
 * route belongs in this app. Same contract, one implementation.
 */
export async function handleChartPublish(req: NextRequest) {
  const expected = (process.env.STREAMER_SECRET ?? process.env.CRON_SECRET ?? "").trim();
  if (!expected) {
    return NextResponse.json({ error: "publish_disabled" }, { status: 503 });
  }

  const provided = req.headers.get("x-streamer-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { roomKey?: string; event?: ChartLiveEvent };
  try {
    body = (await req.json()) as { roomKey?: string; event?: ChartLiveEvent };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.roomKey || !body.event) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const reached = publishChartEvent(body.roomKey, body.event);
  // reached=0 is normal: the streamer publishes every subscribed symbol, and
  // most of them have no chart open at that moment.
  return NextResponse.json({ ok: true, reached }, { headers: { "Cache-Control": "no-store" } });
}
