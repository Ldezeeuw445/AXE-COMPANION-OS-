import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeFavoriteWorkflowIds } from "@/lib/workflows/favorites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ favoriteIds: normalizeFavoriteWorkflowIds([]) });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ favoriteIds: normalizeFavoriteWorkflowIds([]) });

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("favorite_workflow_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  return Response.json({
    favoriteIds: normalizeFavoriteWorkflowIds(data?.favorite_workflow_ids),
  });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { favoriteIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const favoriteIds = normalizeFavoriteWorkflowIds(body.favoriteIds ?? []);

  const { error } = await supabase.from("user_workspace_preferences").upsert(
    {
      user_id: user.id,
      favorite_workflow_ids: favoriteIds,
    },
    { onConflict: "user_id" },
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, favoriteIds });
}
