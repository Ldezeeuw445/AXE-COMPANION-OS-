import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_FAVORITE_WORKFLOW_IDS,
  normalizeFavoriteWorkflowIds,
} from "@/lib/workflows/favorites";

export async function getFavoriteWorkflowIdsForUser(userId: string): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [...DEFAULT_FAVORITE_WORKFLOW_IDS];

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("favorite_workflow_ids")
    .eq("user_id", userId)
    .maybeSingle();

  return normalizeFavoriteWorkflowIds(data?.favorite_workflow_ids);
}

export async function getFavoriteWorkflowIdsServerState(): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [...DEFAULT_FAVORITE_WORKFLOW_IDS];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [...DEFAULT_FAVORITE_WORKFLOW_IDS];

  return getFavoriteWorkflowIdsForUser(user.id);
}
