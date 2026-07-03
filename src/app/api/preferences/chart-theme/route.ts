import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_THEMES = new Set(["midnight", "charcoal", "slate", "paper"]);

/**
 * POST /api/preferences/chart-theme
 *
 * Persists the user's chart theme choice in user_workspace_preferences.
 * Body: { theme: "midnight" | "charcoal" | "slate" | "paper" }
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { theme?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const theme = body.theme;
  if (!theme || !VALID_THEMES.has(theme)) {
    return Response.json({ error: "invalid_theme" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_workspace_preferences")
    .upsert(
      { user_id: user.id, chart_theme: theme },
      { onConflict: "user_id" },
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, theme });
}

/**
 * GET /api/preferences/chart-theme
 *
 * Returns the user's stored chart theme.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ theme: "midnight" });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ theme: "midnight" });

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("chart_theme")
    .eq("user_id", user.id)
    .maybeSingle();

  return Response.json({ theme: (data?.chart_theme as string) ?? "midnight" });
}
