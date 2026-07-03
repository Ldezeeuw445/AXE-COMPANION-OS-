import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdaptiveSuggestionKind, AdaptiveUiSuggestionRow } from "@/types/adaptive";

const CHART_KINDS: AdaptiveSuggestionKind[] = [
  "fib_style_default",
  "quick_action_pin",
  "chart_mode_default",
];

const BRIEFING_KINDS: AdaptiveSuggestionKind[] = ["session_briefing_focus"];

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

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "all";
  const accountId = url.searchParams.get("accountId");

  const { data, error } = (await supabase
    .from("adaptive_ui_suggestions")
    .select("id,user_id,account_id,kind,status,payload,created_at,resolved_at")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(24)) as { data: AdaptiveUiSuggestionRow[] | null; error: { message: string } | null };

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || error.message.includes('adaptive_ui_suggestions')) {
      return NextResponse.json({ ok: true, suggestions: [] });
    }
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  let suggestions = data ?? [];

  if (scope === "chart") {
    suggestions = suggestions.filter((item) => CHART_KINDS.includes(item.kind));
    if (accountId) {
      suggestions = suggestions.filter((item) => item.account_id === accountId || item.account_id === null);
    }
  } else if (scope === "briefing") {
    suggestions = suggestions.filter((item) => BRIEFING_KINDS.includes(item.kind));
  }

  return NextResponse.json({ ok: true, suggestions });
}
