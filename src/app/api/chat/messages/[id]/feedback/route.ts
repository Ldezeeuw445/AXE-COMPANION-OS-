import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordLearningSignal } from "@/services/learningService";

type Params = { params: Promise<{ id: string }> };

type FeedbackBody = {
  rating?: "up" | "down";
};

export async function POST(request: Request, { params }: Params) {
  const { id: messageId } = await params;
  if (!messageId) {
    return NextResponse.json({ error: "missing_message_id" }, { status: 400 });
  }

  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rating = body.rating;
  if (rating !== "up" && rating !== "down") {
    return NextResponse.json({ error: "invalid_rating" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .select("id,role,content,metadata")
    .eq("id", messageId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (msgErr || !message) {
    return NextResponse.json({ error: "message_not_found" }, { status: 404 });
  }
  if (message.role !== "assistant") {
    return NextResponse.json({ error: "assistant_messages_only" }, { status: 422 });
  }

  const metadata = (message.metadata as Record<string, unknown> | null) ?? {};
  const nextMetadata = {
    ...metadata,
    feedback: rating,
    feedback_at: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .from("messages")
    .update({ metadata: nextMetadata })
    .eq("id", messageId)
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await recordLearningSignal(
    supabase,
    user.id,
    "message_feedback",
    {
      rating,
      snippet: String(message.content).slice(0, 240),
    },
    { messageId },
  );

  return NextResponse.json({ ok: true, rating });
}
