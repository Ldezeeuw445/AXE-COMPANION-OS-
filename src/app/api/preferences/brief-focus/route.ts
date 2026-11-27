import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { rejectAnonymous } from "@/lib/auth/anonymousSessions";
import {
  BRIEF_FOCUS_KEY,
  BRIEF_FOCUS_SCOPE,
  loadAccountDigests,
  loadBriefFocusPrefs,
  loadWatchlistSymbols,
} from "@/services/briefInputs";
import { normalizeBriefFocusPrefs, resolveBriefFocus } from "@/lib/briefing/briefFocus";
import { getTraderLearningArc } from "@/services/learningArcService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saved focus + what a brief written right now would cover (the preview in Settings). */
async function stateFor(supabase: NonNullable<Awaited<ReturnType<typeof getAuthedServiceSupabase>>>["supabase"], userId: string) {
  const now = new Date();
  const [prefs, watchlist, arc, accounts] = await Promise.all([
    loadBriefFocusPrefs(supabase, userId),
    loadWatchlistSymbols(supabase, userId).catch(() => [] as string[]),
    getTraderLearningArc(userId, supabase).catch(() => null),
    loadAccountDigests(supabase, userId, now, { marketsOpen: true }).catch(() => null),
  ]);
  const traded = (arc?.topPairs ?? []).slice(0, 3).map((p) => p.symbol);
  const openPositions = (accounts?.positions ?? []).map((p) => p.symbol);
  const preview = resolveBriefFocus({ prefs, watchlist, traded, openPositions });
  return { prefs, sources: { watchlist, traded, openPositions }, preview };
}

export async function GET() {
  const authed = await getAuthedServiceSupabase();
  if (!authed || !rejectAnonymous(authed.user)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await stateFor(authed.supabase, authed.user.id));
}

export async function POST(req: Request) {
  const authed = await getAuthedServiceSupabase();
  if (!authed || !rejectAnonymous(authed.user)) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const prefs = normalizeBriefFocusPrefs((body as { prefs?: unknown })?.prefs ?? body);
  const { error } = await authed.supabase.from("assistant_memory_entries").upsert(
    {
      user_id: authed.user.id,
      scope: BRIEF_FOCUS_SCOPE,
      entry_key: BRIEF_FOCUS_KEY,
      content: JSON.stringify(prefs),
    },
    { onConflict: "user_id,scope,entry_key" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, ...(await stateFor(authed.supabase, authed.user.id)) });
}
