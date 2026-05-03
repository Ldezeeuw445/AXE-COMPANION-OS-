/**
 * POST /api/ai/desk
 *
 * The central AXE AI endpoint — mirrors TradingOS /api/ai/desk.
 * Accepts a message + optional symbol/timeframe, fetches the unified context
 * from /api/context (via contextService), and runs the full AXE response loop.
 *
 * Body:
 *   text         — user message (string)
 *   symbol       — active trading instrument (optional), e.g. "XAUUSD"
 *   tf           — timeframe (optional), e.g. "15m"
 *   imageBase64  — base64 chart image (optional)
 *   imageType    — MIME type of chart image (optional)
 *
 * Response:
 *   { ok: true }   — reply persisted to DB (client polls getChatThread)
 *   { ok: false, error: string } — on failure
 */

import { NextResponse } from "next/server";
import { sendChatMessage } from "@/services/chatService";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
    symbol?: unknown;
    tf?: unknown;
    imageBase64?: unknown;
    imageType?: unknown;
  } | null;

  const text = typeof body?.text === "string" ? body.text : "";
  const symbol = typeof body?.symbol === "string" ? body.symbol : undefined;
  const tf = typeof body?.tf === "string" ? body.tf : undefined;
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : undefined;
  const imageType = typeof body?.imageType === "string" ? body.imageType : undefined;

  const result = await sendChatMessage(text, imageBase64, imageType, symbol, tf);

  if (!result.ok) {
    if (result.quotaExceeded) {
      return NextResponse.json(
        {
          ok: false,
          code: "CHAT_QUOTA",
          error: "Daily free message limit reached. Upgrade to Pro for unlimited chat.",
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "AXE desk call failed." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
