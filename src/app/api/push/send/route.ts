import { NextRequest, NextResponse } from "next/server";
import { isPushCategory } from "@/lib/push/categories";
import { deliverWebPushToUser } from "@/lib/push/deliver";
import { dispatchPushEvent } from "@/lib/push/dispatch";
import { verifyInternalPushRequest } from "@/lib/push/internalPushAuth";
import { buildPushPayload, serializePushPayload } from "@/lib/push/payload";

export async function POST(req: NextRequest) {
  const auth = verifyInternalPushRequest(req.headers);
  if (auth === "missing_secret") {
    return NextResponse.json({ error: "Internal push secret not configured" }, { status: 503 });
  }
  if (auth === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    userId?: string;
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    severity?: "info" | "alert" | "risk" | "high" | "low";
    requireInteraction?: boolean;
    silent?: boolean;
    image?: string;
    actions?: { action: string; title: string; icon?: string }[];
    category?: string;
    eventKey?: string;
    symbol?: string;
    timeframe?: string;
    accountId?: string;
    threadId?: string;
    bypassPrefs?: boolean;
    bypassDedup?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, title } = body;
  if (!userId || !title) {
    return NextResponse.json({ error: "Missing userId or title" }, { status: 400 });
  }

  if (isPushCategory(body.category) && body.eventKey) {
    const result = await dispatchPushEvent({
      userId,
      category: body.category,
      eventKey: body.eventKey,
      title,
      body: body.body,
      url: body.url,
      tag: body.tag,
      symbol: body.symbol,
      timeframe: body.timeframe,
      accountId: body.accountId,
      threadId: body.threadId,
      silent: body.silent,
      requireInteraction: body.requireInteraction,
      actions: body.actions,
      bypassPrefs: body.bypassPrefs === true,
      bypassDedup: body.bypassDedup === true,
    });
    return NextResponse.json(result);
  }

  const payload = buildPushPayload({
    category: "axe_finding",
    eventKey: body.eventKey ?? body.tag ?? `legacy:${Date.now()}`,
    title,
    body: body.body,
    url: body.url,
    tag: body.tag,
    silent: body.silent,
    requireInteraction: body.requireInteraction,
    actions: body.actions,
    symbol: body.symbol,
    timeframe: body.timeframe,
    accountId: body.accountId,
    threadId: body.threadId,
  });

  const delivered = await deliverWebPushToUser({
    userId,
    payload: serializePushPayload(payload),
  });

  return NextResponse.json({ ok: true, ...delivered, url: payload.url });
}
