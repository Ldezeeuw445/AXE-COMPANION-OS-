import type {
  AdaptiveTradingProfile,
  AdaptiveUiDecisionSet,
  AdaptiveUiProfileRow,
  AdaptiveUiSuggestionRow,
} from "@/types/adaptive";
import { buildAdaptiveDecisionSet, preferredChartDefaults } from "@/lib/adaptive/profileEngine";

/**
 * Structural stand-in for whichever Supabase client the caller passes — the
 * cookie client, the service-role client, or a test double. Typing the full
 * PostgREST builder chain here does not pay off: every stricter shape we tried
 * failed to accept the real PostgrestFilterBuilder at the call sites, pushing
 * the error into the routes instead of removing it. The awaited result is cast
 * explicitly by each loader below, which is where the real typing lives.
 */
type SupabaseLike = {
  from: (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (query: string) => any;
  };
};

export async function loadAdaptiveProfile(
  supabase: SupabaseLike,
  userId: string,
): Promise<AdaptiveTradingProfile | null> {
  const { data } = (await supabase
    .from("adaptive_ui_profiles")
    .select("user_id,profile,updated_at")
    .eq("user_id", userId)
    .maybeSingle()) as { data: AdaptiveUiProfileRow | null };

  if (!data?.profile) return null;
  return data.profile;
}

export async function loadAdaptiveSuggestions(
  supabase: SupabaseLike,
  userId: string,
): Promise<AdaptiveUiSuggestionRow[]> {
  const { data } = (await supabase
    .from("adaptive_ui_suggestions")
    .select("id,user_id,account_id,kind,status,payload,created_at,resolved_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(24)) as { data: AdaptiveUiSuggestionRow[] | null };

  return data ?? [];
}

export async function loadAdaptiveDecisionSet(
  supabase: SupabaseLike,
  input: {
    userId: string;
    accountId?: string | null;
    displayName?: string | null;
  },
): Promise<AdaptiveUiDecisionSet> {
  const profile = await loadAdaptiveProfile(supabase, input.userId);
  return buildAdaptiveDecisionSet({
    profile,
    accountId: input.accountId ?? null,
    displayName: input.displayName ?? null,
  });
}

export async function loadAdaptiveChartDefaults(
  supabase: SupabaseLike,
  userId: string,
  accountId?: string | null,
): Promise<{ symbol: string | null; timeframe: string | null }> {
  const profile = await loadAdaptiveProfile(supabase, userId);
  return preferredChartDefaults(profile, accountId ?? null);
}
