import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getInstantSlTpModifyServerState(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("instant_sl_tp_modify")
    .eq("user_id", user.id)
    .maybeSingle();

  return Boolean(data?.instant_sl_tp_modify);
}
