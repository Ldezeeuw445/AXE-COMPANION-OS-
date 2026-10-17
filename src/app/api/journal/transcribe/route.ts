import { createServerSupabaseClient } from "@/lib/supabase/server";
import { JOURNAL_ATTACHMENT_MAX_BYTES, isAllowedMime } from "@/lib/journal/attachmentPath";
import { transcribeJournalAudio } from "@/lib/journal/transcribeAudio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return json({ ok: false, error: "supabase_not_configured" }, 503);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "invalid_form" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "missing file" }, 400);
  const mime = (file.type || "audio/webm").toLowerCase();
  if (!isAllowedMime("voice", mime)) return json({ ok: false, error: "unsupported mime" }, 400);
  if (file.size <= 0 || file.size > JOURNAL_ATTACHMENT_MAX_BYTES) {
    return json({ ok: false, error: "file too large" }, 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await transcribeJournalAudio(bytes, mime, file.name || "voice.webm");
  if (result.reason === "not_configured") {
    return json({ ok: true, transcript: null, storedAudioOnly: true, reason: "not_configured" });
  }
  if (result.reason === "failed") {
    return json({ ok: true, transcript: null, storedAudioOnly: true, reason: "failed" });
  }
  return json({ ok: true, transcript: result.transcript, storedAudioOnly: !result.transcript });
}
