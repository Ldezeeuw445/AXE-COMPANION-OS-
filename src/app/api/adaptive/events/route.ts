import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdaptiveUiClientEvent } from "@/types/adaptive";
import { buildAdaptiveSuggestions, deriveAdaptiveTradingProfile } from "@/lib/adaptive/profileEngine";

export async function POST(request: Request) {
  try {
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

    const body = (await request.json()) as AdaptiveUiClientEvent;
    if (!body?.eventType || !body?.route) {
      return NextResponse.json({ ok: false, message: "Missing event fields." }, { status: 400 });
    }

    const { error } = await supabase.from("adaptive_ui_events").insert({
      user_id: user.id,
      account_id: body.accountId ?? null,
      event_type: body.eventType,
      route: body.route,
      session_id: body.sessionId ?? null,
      occurred_at: body.occurredAt ?? new Date().toISOString(),
      payload: body.payload ?? {},
    });

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    const [{ data: events }, { data: suggestions }] = await Promise.all([
      supabase
        .from("adaptive_ui_events")
        .select("user_id,account_id,event_type,route,session_id,occurred_at,payload")
        .eq("user_id", user.id)
        .order("occurred_at", { ascending: false })
        .limit(320),
      supabase
        .from("adaptive_ui_suggestions")
        .select("id,user_id,account_id,kind,status,payload,created_at,resolved_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(24),
    ]);

    const profile = deriveAdaptiveTradingProfile({
      userId: user.id,
      events: (events ?? []).map((item) => ({
        userId: item.user_id,
        accountId: item.account_id,
        eventType: item.event_type,
        route: item.route,
        sessionId: item.session_id,
        occurredAt: item.occurred_at,
        payload: item.payload ?? {},
      })),
      suggestions: suggestions ?? [],
    });

    const { error: profileError } = await supabase
      .from("adaptive_ui_profiles")
      .upsert({
        user_id: user.id,
        profile,
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      return NextResponse.json({ ok: false, message: profileError.message }, { status: 500 });
    }

    const newSuggestions = buildAdaptiveSuggestions(profile);
    if (newSuggestions.length > 0) {
      await supabase.from("adaptive_ui_suggestions").insert(
        newSuggestions.map((item) => ({
          user_id: user.id,
          account_id: item.accountId ?? null,
          kind: item.kind,
          status: "pending",
          payload: item.payload,
        })),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown telemetry error.",
      },
      { status: 500 },
    );
  }
}
