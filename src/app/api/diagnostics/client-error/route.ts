import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/diagnostics/client-error
 *
 * Records a crash from one of the app's error boundaries.
 *
 * This used to only `console.error`, and the boundary that calls it only called
 * it outside production — so the screen promised "This has been noted" while
 * noting nothing, and the one copy that did exist sat in a VPS log file that
 * needs SSH to read. Reports now land in axe_client_errors, which anyone with
 * database access can query without a person relaying logs.
 *
 * Deliberately permissive about who may post: a crash report is worth more than
 * the risk of junk rows, and the boundary fires before we know whether the
 * session survived. The user id is attached when a session happens to be
 * readable, and left null otherwise.
 */
type Body = {
  message?: unknown;
  stack?: unknown;
  digest?: unknown;
  url?: unknown;
  userAgent?: unknown;
  source?: unknown;
  extra?: unknown;
};

function str(v: unknown, max = 8000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max)}… [truncated]` : t;
}

export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const message = str(body.message, 2000) ?? "(no message)";
  const record = {
    message,
    stack: str(body.stack, 12000),
    digest: str(body.digest, 200),
    url: str(body.url, 2000),
    user_agent: str(body.userAgent, 500),
    source: str(body.source, 100) ?? "app_error_boundary",
    extra: body.extra && typeof body.extra === "object" ? body.extra : null,
  };

  // Always visible in the host log too — that path cost nothing and is the
  // fallback when the database write itself is what is broken.
  console.error("[client-error]", JSON.stringify(record));

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: true, stored: false, reason: "no_service_role" });
  }

  let userId: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }
  } catch {
    // A crash report from a broken session is still worth keeping.
  }

  const { error } = await service
    .from("axe_client_errors")
    .insert({ ...record, user_id: userId });

  if (error) {
    console.error("[client-error] insert failed:", error.message);
    return NextResponse.json({ ok: true, stored: false, reason: error.message });
  }

  return NextResponse.json({ ok: true, stored: true });
}
