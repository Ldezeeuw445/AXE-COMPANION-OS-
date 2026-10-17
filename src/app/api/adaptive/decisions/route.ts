import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadAdaptiveDecisionSet } from "@/lib/adaptive/server";
import { requireEntitlementFeature } from "@/lib/billing/requireFeature";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Supabase unavailable." }, { status: 503 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }
  const gate = await requireEntitlementFeature(supabase, user.id, "advanced_memory");
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.error, upgradeRequired: true }, { status: gate.status });
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");

  const decisions = await loadAdaptiveDecisionSet(supabase, {
    userId: user.id,
    accountId,
  });

  return NextResponse.json({ ok: true, decisions });
}
