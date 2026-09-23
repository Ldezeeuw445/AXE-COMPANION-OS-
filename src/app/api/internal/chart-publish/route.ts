import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { publishChartEvent } from "@/lib/chart/attachChartWebSocket";
import type { ChartLiveEvent } from "@/lib/chart/liveContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/chart-publish — real MetaApi ticks, straight from the
 * streamer into this server's chart rooms.
 *
 * The streamer (node/metaapi-streamer) was written to push into the
 * Cloudflare worker, which is answering 1027 — its free allowance is spent.
 * This is the same contract on the box that actually serves the app:
 * `{ roomKey, event }` with an `X-Streamer-Secret` header, and the same
 * `userId|accountId|brokerSymbol|timeframe` key, `*` in the timeframe slot
 * meaning every timeframe open on that symbol. So the streamer only needs its
 * WORKER_URL pointed here.
 *
 * Both this route and the WebSocket gateway live in the one `next start`
 * process, which is why an in-memory fan-out reaches the connected clients.
 */

function authorized(req: NextRequest): boolean {
  const expected = (process.env.STREAMER_SECRET ?? process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const provided = req.headers.get("x-streamer-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.STREAMER_SECRET && !process.env.CRON_SECRET) {
    return NextResponse.json({ error: "publish_disabled" }, { status: 503 });
  }
  if (!authorized(req)) {
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
  // 200 with reached=0 is normal and not an error: the streamer publishes for
  // every subscribed symbol, and most of them have no chart open right now.
  return NextResponse.json({ ok: true, reached }, { headers: { "Cache-Control": "no-store" } });
}
