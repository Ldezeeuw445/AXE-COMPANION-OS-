import type {
  AdaptiveTradingProfile,
  AdaptiveUiDecisionSet,
  AdaptiveUiProfileRow,
  AdaptiveUiSuggestionRow,
} from "@/types/adaptive";
import { buildAdaptiveDecisionSet, preferredChartDefaults } from "@/lib/adaptive/profileEngine";

type SupabaseLike = {
  from: (table: string) => {
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
