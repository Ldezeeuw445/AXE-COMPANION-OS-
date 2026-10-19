/**
 * POST /api/push/alert
 *
 * External webhook — allows TradingOS to trigger push notifications
 * when a price alert fires.
 *
 * Secured with PUSH_WEBHOOK_SECRET env var.
 */
import { NextRequest, NextResponse } from "next/server";
import { dispatchPushEvent } from "@/lib/push/dispatch";

export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  const incoming = req.headers.get("x-webhook-secret");

  if (!secret || incoming !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    userId?: string;
    title?: string;
    body?: string;
    url?: string;
    symbol?: string;
    timeframe?: string;
    eventKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, title, body: msgBody, url, symbol, timeframe, eventKey } = body;
  if (!userId || !title) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const result = await dispatchPushEvent({
    userId,
    category: "price_alert",
    eventKey: eventKey ?? `price_alert:webhook:${userId}:${title}`.slice(0, 240),
    title,
    body: msgBody,
    url,
    symbol,
    timeframe,
  });

  return NextResponse.json(result);
}
