/**
 * POST /api/push/alert
 *
 * External webhook — allows TradingOS to trigger push notifications
 * when a price alert fires.
 *
 * Secured with PUSH_WEBHOOK_SECRET env var.
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  const incoming = req.headers.get("x-webhook-secret");

  if (secret && incoming !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: string; title?: string; body?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, title, body: msgBody, url } = body;
  if (!userId || !title) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Delegate to internal send route
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "localhost:5000"}`;

  const result = await fetch(`${baseUrl}/api/push/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, title, body: msgBody, url }),
  });

  const data = await result.json();
  return NextResponse.json(data, { status: result.status });
}
