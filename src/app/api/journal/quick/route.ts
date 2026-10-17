import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadQuickJournalDraftByTrade } from "@/lib/journal/loadQuickJournalDraft";
import { saveTradeJournalLabel } from "@/lib/journal/saveTradeJournalLabel";
import { readActiveSessionCookie } from "@/lib/session/readActiveSession.server";

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

  const url = new URL(req.url);
  const tradeId = (url.searchParams.get("tradeId") ?? "").trim();
  const accountId = (url.searchParams.get("accountId") ?? "").trim();
  if (!tradeId || !accountId) return json({ ok: false, error: "missing tradeId or accountId" }, 400);

  const session = await readActiveSessionCookie();
  const draft = await loadQuickJournalDraftByTrade(supabase, user.id, tradeId, accountId, session);
  if (!draft) return json({ ok: false, error: "trade_not_found" }, 404);

  const { data: attachments } = await supabase
    .from("journal_attachments")
    .select("id,kind,mime_type,byte_size,transcript,created_at")
    .eq("user_id", user.id)
    .eq("trade_id", tradeId)
    .order("created_at", { ascending: false });

  return json({ ok: true, draft, attachments: attachments ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return json({ ok: false, error: "supabase_not_configured" }, 503);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);

  let body: { tradeId?: string; accountId?: string; label?: string | null; note?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "invalid_body" }, 400);
  }

  const result = await saveTradeJournalLabel(supabase, user.id, {
    tradeId: String(body.tradeId ?? ""),
    accountId: String(body.accountId ?? ""),
    label: body.label ?? null,
    note: body.note ?? null,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);

  revalidatePath("/journal");
  revalidatePath("/history");
  return json({ ok: true });
}
