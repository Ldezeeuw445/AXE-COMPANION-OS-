import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { ensureDemoWorkspace } from "@/lib/broker/demoAccount";

function demoCreds() {
  const email = process.env.DEMO_USER_EMAIL?.trim();
  const password = process.env.DEMO_USER_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}

function demoAuthAllowed() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEMO_AUTH === "true"
  );
}

function closedNotFound() {
  return new NextResponse(null, { status: 404 });
}

export async function GET() {
  return closedNotFound();
}

export async function POST() {
  if (!demoAuthAllowed()) return closedNotFound();

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }

  // Preferred path: anonymous demo session (no shared credentials needed).
  const anon = await supabase.auth.signInAnonymously({
    options: {
      data: {
        app_mode: "public_demo",
      },
    },
  });
  if (!anon.error) {
    const userId = anon.data.user?.id ?? null;
    if (userId) {
      const service = createServiceRoleSupabaseClient();
      if (service) {
        await Promise.all([
          service.from("axe_user_entitlements").upsert(
            {
              user_id: userId,
              plan: "free",
              founder_badge: false,
              chat_quota_exempt: false,
              pro_until: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          ),
          ensureDemoWorkspace(service, userId),
        ]);
      }
    }
    return NextResponse.json({
      ok: true,
      mode: "anonymous",
      userId,
    });
  }

  // Fallback path: shared demo account from env.
  const creds = demoCreds();
  if (creds) {
    const seeded = await supabase.auth.signInWithPassword(creds);
    if (!seeded.error) {
      const userId = seeded.data.user?.id ?? null;
      const service = createServiceRoleSupabaseClient();
      if (userId && service) {
        await Promise.all([
          service.from("axe_user_entitlements").upsert(
            {
              user_id: userId,
              plan: "free",
              founder_badge: false,
              chat_quota_exempt: false,
              pro_until: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          ),
          ensureDemoWorkspace(service, userId),
        ]);
      }
      return NextResponse.json({
        ok: true,
        mode: "shared_demo_user",
        userId,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: "Demo auth failed",
      },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Demo auth unavailable",
    },
    { status: 403 },
  );
}

export async function DELETE() {
  if (!demoAuthAllowed()) return closedNotFound();
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ ok: true });
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
