import { NextResponse } from "next/server";
import { getChatThread } from "@/services/chatService";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authed = await getAuthedServiceSupabase();
  if (!authed) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "intel" ? "intel" : "axe";
  const { conversation, messages } = await getChatThread(type);

  return NextResponse.json({
    ok: true,
    conversation,
    messages,
  });
}
