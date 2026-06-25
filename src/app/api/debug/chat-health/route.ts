/**
 * GET /api/debug/chat-health
 *
 * Shows exactly which dependencies are missing so you know why chat fails.
 * Safe to call while logged in — returns 401 if no session.
 */
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { isMockDataSource } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string | boolean> = {};

  // 1. Mock mode?
  checks.mock_mode = isMockDataSource();
  checks.supabase_url = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  checks.supabase_anon_key = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  checks.openai_api_key = Boolean(process.env.OPENAI_API_KEY);
  checks.ollama_url = process.env.OLLAMA_API_URL ?? "(default: https://ollama.axecompanion.com/api)";
  checks.llm_target = process.env.LLM_TARGET ?? "auto";
  checks.skip_chat_quota = process.env.AXE_SKIP_CHAT_QUOTA ?? "false";

  // 2. Auth
  const authed = await getAuthedServiceSupabase();
  checks.auth_ok = Boolean(authed);
  if (authed) {
    checks.user_id = authed.user.id.slice(0, 8) + "...";

    // 3. Chat quota RPC
    try {
      const { error } = await authed.supabase.rpc("axe_chat_try_consume");
      checks.quota_rpc = error ? `ERROR: ${error.message}` : "ok";
    } catch (e) {
      checks.quota_rpc = `THREW: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 4. Conversations table
    try {
      const { error } = await authed.supabase
        .from("conversations")
        .select("id")
        .limit(1);
      checks.conversations_table = error ? `ERROR: ${error.message}` : "ok";
    } catch (e) {
      checks.conversations_table = `THREW: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // 5. LLM reachability (non-destructive ping)
  if (process.env.OPENAI_API_KEY) {
    try {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      checks.openai_reachable = r.ok ? "ok" : `HTTP ${r.status}`;
    } catch (e) {
      checks.openai_reachable = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    checks.openai_reachable = "skipped (no key)";
  }

  const allOk =
    !checks.mock_mode &&
    checks.auth_ok &&
    (checks.openai_api_key || checks.llm_target === "ollama") &&
    checks.quota_rpc === "ok";

  return Response.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
}
