import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdaptiveAccountProfile, AdaptiveGlobalPreferences, AdaptiveTradingProfile, AdaptiveUiSuggestionRow } from "@/types/adaptive";

function patchAccountProfile(
  profile: AdaptiveTradingProfile,
  accountId: string | null,
  patcher: (account: AdaptiveAccountProfile) => AdaptiveAccountProfile,
): AdaptiveTradingProfile {
  if (!accountId) return profile;
  return {
    ...profile,
    accountProfiles: profile.accountProfiles.map((account) =>
      account.accountId === accountId ? patcher(account) : account,
    ),
    updatedAt: new Date().toISOString(),
  };
}

function patchGlobalPreferences(
  profile: AdaptiveTradingProfile,
  patcher: (prefs: AdaptiveGlobalPreferences) => AdaptiveGlobalPreferences,
): AdaptiveTradingProfile {
  return {
    ...profile,
    globalPreferences: patcher(profile.globalPreferences),
    updatedAt: new Date().toISOString(),
  };
}

function applySuggestion(
  profile: AdaptiveTradingProfile,
  suggestion: AdaptiveUiSuggestionRow,
): AdaptiveTradingProfile {
  switch (suggestion.kind) {
    case "quick_action_pin": {
      const actions = Array.isArray(suggestion.payload.actions)
        ? suggestion.payload.actions.filter((item): item is string => typeof item === "string").slice(0, 5)
        : [];
      return patchAccountProfile(profile, suggestion.account_id, (account) => ({
        ...account,
        pinnedQuickActions: actions,
      }));
    }
    case "chart_mode_default": {
      const mode = typeof suggestion.payload.mode === "string" ? suggestion.payload.mode : null;
      return patchAccountProfile(profile, suggestion.account_id, (account) => ({
        ...account,
        defaultChartMode: mode,
      }));
    }
    case "fib_style_default": {
      const mode = typeof suggestion.payload.mode === "string" ? suggestion.payload.mode : null;
      return patchGlobalPreferences(profile, (prefs) => ({
        ...prefs,
        fibStyleOverride: mode,
      }));
    }
    case "session_briefing_focus": {
      const session = typeof suggestion.payload.session === "string" ? suggestion.payload.session : null;
      return patchGlobalPreferences(profile, (prefs) => ({
        ...prefs,
        briefingSessionOverride:
          session === "asia" || session === "london" || session === "newyork" || session === "mixed"
            ? session
            : null,
      }));
    }
    default:
      return profile;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: "accept" | "dismiss" };
  const action = body.action === "dismiss" ? "dismiss" : "accept";

  const { data: suggestion, error: suggestionError } = (await supabase
    .from("adaptive_ui_suggestions")
    .select("id,user_id,account_id,kind,status,payload,created_at,resolved_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()) as { data: AdaptiveUiSuggestionRow | null; error: { message: string } | null };

  if (suggestionError) {
    return NextResponse.json({ ok: false, message: suggestionError.message }, { status: 500 });
  }
  if (!suggestion) {
    return NextResponse.json({ ok: false, message: "Suggestion not found." }, { status: 404 });
  }

  const { error: updateSuggestionError } = await supabase
    .from("adaptive_ui_suggestions")
    .update({
      status: action === "accept" ? "accepted" : "dismissed",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateSuggestionError) {
    return NextResponse.json({ ok: false, message: updateSuggestionError.message }, { status: 500 });
  }

  if (action === "accept") {
    const { data: profileRow } = (await supabase
      .from("adaptive_ui_profiles")
      .select("user_id,profile,updated_at")
      .eq("user_id", user.id)
      .maybeSingle()) as { data: { profile: AdaptiveTradingProfile | null } | null };

    if (profileRow?.profile) {
      const nextProfile = applySuggestion(profileRow.profile, suggestion);
      await supabase
        .from("adaptive_ui_profiles")
        .update({
          profile: nextProfile,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }
  }

  return NextResponse.json({ ok: true, action });
}
