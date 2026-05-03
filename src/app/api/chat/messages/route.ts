import { NextResponse } from "next/server";
import { sendChatMessage } from "@/services/chatService";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { text?: unknown; imageBase64?: unknown; imageType?: unknown; symbol?: unknown; tf?: unknown }
    | null;

  const text = typeof body?.text === "string" ? body.text : "";
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : undefined;
  const imageType = typeof body?.imageType === "string" ? body.imageType : undefined;
  const symbol = typeof body?.symbol === "string" ? body.symbol : undefined;
  const tf = typeof body?.tf === "string" ? body.tf : undefined;

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
      { ok: false, error: "Could not persist message." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
