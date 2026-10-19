import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  JOURNAL_ATTACHMENT_BUCKET,
  JOURNAL_ATTACHMENT_MAX_BYTES,
  isAllowedMime,
  isJournalAttachmentKind,
  journalAttachmentObjectPath,
  objectPathBelongsToUser,
  type JournalAttachmentKind,
} from "@/lib/journal/attachmentPath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return json({ ok: false, error: "supabase_not_configured" }, 503);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);

  const tradeId = new URL(req.url).searchParams.get("tradeId")?.trim() ?? "";
  if (!tradeId) return json({ ok: false, error: "missing tradeId" }, 400);

  const { data, error } = await supabase
    .from("journal_attachments")
    .select("id,kind,mime_type,byte_size,transcript,created_at,storage_path")
    .eq("user_id", user.id)
    .eq("trade_id", tradeId)
    .order("created_at", { ascending: false });

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, attachments: data ?? [] });
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

  const tradeId = String(form.get("tradeId") ?? "").trim();
  const accountId = String(form.get("accountId") ?? "").trim();
  const kindRaw = String(form.get("kind") ?? "").trim();
  const transcript = String(form.get("transcript") ?? "").trim() || null;
  const file = form.get("file");

  if (!tradeId || !accountId) return json({ ok: false, error: "missing trade or account" }, 400);
  if (!isJournalAttachmentKind(kindRaw)) return json({ ok: false, error: "invalid kind" }, 400);
  if (!(file instanceof File)) return json({ ok: false, error: "missing file" }, 400);

  const kind = kindRaw as JournalAttachmentKind;
  const mime = (file.type || "application/octet-stream").toLowerCase();
  if (!isAllowedMime(kind, mime)) {
    return json({ ok: false, error: `unsupported mime for ${kind}` }, 400);
  }
  if (file.size <= 0 || file.size > JOURNAL_ATTACHMENT_MAX_BYTES) {
    return json({ ok: false, error: "file too large" }, 400);
  }

  const { data: tr, error: trErr } = await supabase
    .from("broker_trades")
    .select("id")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .eq("id", tradeId)
    .maybeSingle();
  if (trErr) return json({ ok: false, error: trErr.message }, 500);
  if (!tr) return json({ ok: false, error: "trade_not_found" }, 404);

  const attachmentId = crypto.randomUUID();
  const storagePath = journalAttachmentObjectPath({
    userId: user.id,
    tradeId,
    attachmentId,
    mime,
  });
  if (!objectPathBelongsToUser(storagePath, user.id)) {
    return json({ ok: false, error: "path_rejected" }, 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(JOURNAL_ATTACHMENT_BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  const { data: row, error: insErr } = await supabase
    .from("journal_attachments")
    .insert({
      id: attachmentId,
      user_id: user.id,
      trade_id: tradeId,
      account_id: accountId,
      kind,
      storage_path: storagePath,
      mime_type: mime,
      byte_size: file.size,
      transcript,
    })
    .select("id,kind,mime_type,byte_size,transcript,created_at")
    .maybeSingle();

  if (insErr) {
    await supabase.storage.from(JOURNAL_ATTACHMENT_BUCKET).remove([storagePath]);
    return json({ ok: false, error: insErr.message }, 500);
  }

  return json({ ok: true, attachment: row });
}
