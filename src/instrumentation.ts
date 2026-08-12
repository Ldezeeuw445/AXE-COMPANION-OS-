/**
 * Next.js instrumentation hook — runs once when the server process boots.
 *
 * The packaged Tauri desktop app spawns this server's Node sidecar on a
 * random free local port each launch (src-tauri/src/lib.rs's free_port()),
 * by design — not something to change just to make a fixed port easier to
 * reach. AXE Core (a sibling Tauri app, same Mac, same Supabase project)
 * needs to discover that port to call this app's /api/tools/call and
 * /api/cron/intel-correlate routes, so this registers it in global_memory
 * on every boot — the same durable, session-independent store AXE Core's
 * own durableConfigService.ts already uses for exactly this kind of
 * cross-window/cross-app config problem.
 *
 * No-ops on Vercel (no PORT env var set the same way) and in the edge
 * runtime (service-role Supabase access needs the Node runtime).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const port = process.env.PORT;
  if (!port) return;

  try {
    const { createServiceRoleSupabaseClient } = await import("@/lib/supabase/serviceRole");
    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return;

    // Same account intel_correlations rows and the correlate cron already
    // use — this app is effectively single-tenant, no per-boot "user".
    const AXE_OWNER_USER_ID = "acff7a12-1111-481d-a7a9-cc07583b8069";

    const { error } = await supabase.from("global_memory").upsert(
      {
        user_id: AXE_OWNER_USER_ID,
        category: "system_event",
        key: "cfg:companion_sidecar",
        value: JSON.stringify({
          port: Number(port),
          pid: process.pid,
          startedAt: new Date().toISOString(),
        }),
        confidence: 1,
      },
      { onConflict: "user_id,key" },
    );
    if (error) {
      console.error("[instrumentation] failed to register sidecar port:", error.message);
    } else {
      console.log(`[instrumentation] registered sidecar port ${port} in global_memory`);
    }
  } catch (e) {
    console.error("[instrumentation] port registration failed:", e);
  }
}
