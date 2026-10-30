import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AXE_OWNER_USER_ID = "acff7a12-1111-481d-a7a9-cc07583b8069";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /api/trading-team/runs — read-only Trading Team TEST log from Core.
 * Owner-only. Rows live in shared Supabase `core_trading_team_runs`.
 */
export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  if (user.id !== AXE_OWNER_USER_ID) {
    return jsonResponse({ ok: false, error: "forbidden" }, 403);
  }

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "40") || 40));

  // Service role omdat de tabel door Core geschreven wordt in hetzelfde
  // project. Hier stond dat RLS op deze tabel "open" zou zijn, zoals bij
  // core_trading_trades — dat klopt niet, en het is een gevaarlijke opmerking
  // om te laten staan. Gemeten op 30 oktober: beide tabellen hebben precies
  // één policy, `TO authenticated USING (core_owner())`. Er is dus geen
  // policy voor anon, en RLS geeft een anonieme lezer nul rijen. De
  // service-role is hier nodig omdat `core_owner()` op Core's eigen
  // eigenaarsbegrip slaat, niet omdat de tabel openstaat.
  const admin = createServiceRoleSupabaseClient() ?? supabase;
  const { data, error } = await admin
    .from("core_trading_team_runs")
    .select(
      "id,created_at,cycle_id,status,mode,account_id,account_label,companion_broker_account_id,account_guard,account_guard_reason,verdict,confidence,symbol,side,proposal,execution,decision,error",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    // Table missing until Core migration is applied — soft empty for UI.
    if (/does not exist|relation .* does not exist/i.test(error.message)) {
      return jsonResponse({ ok: true, runs: [], pendingMigration: true });
    }
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  return jsonResponse({ ok: true, runs: data ?? [] });
}
