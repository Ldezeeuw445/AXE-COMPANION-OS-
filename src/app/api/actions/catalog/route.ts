import { createClient } from "@supabase/supabase-js";
import { buildWorkflowCatalog } from "@/lib/workflows/catalog";
import { normalizeFavoriteWorkflowIds } from "@/lib/workflows/favorites";
import { buildWorkflowRuntime, detectActionRuntime } from "@/lib/workflows/runtime";

const allowedOrigins = new Set(["https://tradingosapp.com", "https://www.tradingosapp.com"]);

function headersFor(request: Request) {
  const headers = new Headers({ Vary: "Origin", "Cache-Control": "private, no-store" });
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  }
  return headers;
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: headersFor(request) });
}

export async function GET(request: Request) {
  const headers = headersFor(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!url || !key) return Response.json({ error: "not_configured" }, { status: 503, headers });
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user || user.is_anonymous) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const [runtime, prefs] = await Promise.all([
    detectActionRuntime({ supabase, userId: user.id }),
    supabase.from("user_workspace_preferences").select("favorite_workflow_ids").eq("user_id", user.id).maybeSingle(),
  ]);
  return Response.json({
    categories: buildWorkflowCatalog(buildWorkflowRuntime(runtime)),
    favoriteIds: normalizeFavoriteWorkflowIds(prefs.data?.favorite_workflow_ids),
  }, { headers });
}
