import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadLastClosedQuickJournalDraft } from "@/lib/journal/loadQuickJournalDraft";
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
  const session = await readActiveSessionCookie();
  const accountId = (url.searchParams.get("accountId") ?? session.accountId ?? "").trim();
  const symbol = (url.searchParams.get("symbol") ?? session.symbol ?? "").trim();
  if (!accountId) return json({ ok: false, error: "missing accountId" }, 400);

  const draft = await loadLastClosedQuickJournalDraft(
    supabase,
    user.id,
    accountId,
    symbol || null,
    session,
  );
  if (!draft && symbol) {
    const fallback = await loadLastClosedQuickJournalDraft(
      supabase,
      user.id,
      accountId,
      null,
      session,
    );
    if (!fallback) return json({ ok: true, draft: null });
    return json({ ok: true, draft: fallback, matchedSymbol: false });
  }

  return json({ ok: true, draft, matchedSymbol: Boolean(draft && symbol) });
}
