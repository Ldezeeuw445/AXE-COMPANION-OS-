/**
 * POST /api/webhooks/krater-feed
 *
 * Manual ingest for broadcast feed (optional — production uses /api/cron/krater-feed-sync).
 * Secured with KRATER_WEBHOOK_SECRET (header: x-webhook-secret).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  amsterdamContentDate,
  upsertBroadcastFeedItem,
  type BroadcastType,
} from "@/services/broadcastFeedService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function inferBroadcastType(raw: Record<string, unknown>): BroadcastType | null {
  const candidates = [
    raw.kind,
    raw.broadcast_type,
    raw.broadcastType,
    raw.type,
    raw.task,
    raw.taskName,
    raw.task_name,
  ];
  for (const c of candidates) {
    const s = String(c ?? "").toLowerCase();
    if (s.includes("recap") || s.includes("market_recap")) return "market_recap";
    if (s.includes("news") || s.includes("daily_news")) return "daily_news";
  }
  return null;
}

function extractBody(raw: Record<string, unknown>): string {
  for (const key of ["body", "content", "output", "text", "message", "result"]) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (typeof raw.data === "object" && raw.data) {
    return extractBody(raw.data as Record<string, unknown>);
  }
  return "";
}

function extractTitle(raw: Record<string, unknown>, broadcastType: BroadcastType): string {
  for (const key of ["title", "subject", "headline"]) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return broadcastType === "market_recap" ? "Market Recap" : "Daily News";
}

function contentDate(raw: Record<string, unknown>): string {
  for (const key of ["content_date", "contentDate", "date", "briefing_date"]) {
    const v = raw[key];
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
      return v.trim();
    }
  }
  return amsterdamContentDate();
}

export async function POST(req: NextRequest) {
  const secret = process.env.KRATER_WEBHOOK_SECRET?.trim();
  const incoming = req.headers.get("x-webhook-secret")?.trim();

  if (!secret || incoming !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const broadcastType = inferBroadcastType(raw);
  if (!broadcastType) {
    return NextResponse.json(
      { error: "Missing broadcast type — set kind to daily_news or market_recap" },
      { status: 400 },
    );
  }

  const body = extractBody(raw);
  if (!body) {
    return NextResponse.json({ error: "Missing body/content/output text" }, { status: 400 });
  }

  const title = extractTitle(raw, broadcastType);
  const contentDateValue = contentDate(raw);
  const externalKey =
    typeof raw.external_key === "string"
      ? raw.external_key
      : typeof raw.id === "string"
        ? raw.id
        : `${broadcastType}:${contentDateValue}`;

  try {
    const data = await upsertBroadcastFeedItem({
      broadcastType,
      title,
      body,
      contentDate: contentDateValue,
      externalKey,
      source: "krater",
    });

    return NextResponse.json({
      ok: true,
      id: data.id,
      broadcastType: data.broadcast_type,
      contentDate: data.content_date,
      createdAt: data.created_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[krater-feed] upsert failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
