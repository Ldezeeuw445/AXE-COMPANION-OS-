import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

function demoCreds() {
  const email = process.env.DEMO_USER_EMAIL?.trim();
  const password = process.env.DEMO_USER_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}

export async function POST() {
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
        await service.from("axe_user_entitlements").upsert(
          {
            user_id: userId,
            plan: "founder",
            founder_badge: true,
            chat_quota_exempt: true,
            pro_until: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
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
      return NextResponse.json({
        ok: true,
        mode: "shared_demo_user",
        userId: seeded.data.user?.id ?? null,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: seeded.error.message,
      },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "Demo auth unavailable. Enable Supabase anonymous auth or set DEMO_USER_EMAIL + DEMO_USER_PASSWORD.",
      detail: anon.error.message,
    },
    { status: 403 },
  );
}

export async function DELETE() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ ok: true });
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
