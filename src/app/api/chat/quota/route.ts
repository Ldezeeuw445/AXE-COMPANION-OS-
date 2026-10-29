import { NextResponse } from "next/server";
import {
  enrichChatQuotaPayload,
  isUnlimitedChatUserId,
  skipChatQuota,
  type ChatQuotaPayload,
} from "@/lib/chatQuota";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (skipChatQuota()) {
    return NextResponse.json(
      enrichChatQuotaPayload({
        ok: true,
        plan: "pro",
        limit: 20,
        used: 0,
        remaining: -1,
        skipped: true,
      }),
    );
  }

  if (isUnlimitedChatUserId(user.id)) {
    return NextResponse.json(
      enrichChatQuotaPayload({
        ok: true,
        plan: "exempt",
        limit: 20,
        used: 0,
        remaining: -1,
        skipped: true,
      }),
    );
  }

  const { data, error } = await supabase.rpc("axe_chat_quota_status");
  if (error) {
    console.error("[api/chat/quota] rpc failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json(enrichChatQuotaPayload(data as ChatQuotaPayload));
}
