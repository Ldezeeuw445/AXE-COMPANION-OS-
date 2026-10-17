import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_PUSH_PREFS,
  mergePushSliceIntoPreferences,
  prefsFromProfileRow,
  sanitizePushPrefs,
  type PushNotificationPrefs,
} from "@/lib/push/prefs";

export async function getPushNotificationPrefsServerState(): Promise<PushNotificationPrefs> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return DEFAULT_PUSH_PREFS;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_PUSH_PREFS;

  const { data } = await supabase
    .from("profiles")
    .select("preferences,timezone")
    .eq("id", user.id)
    .maybeSingle();

  return prefsFromProfileRow(data?.preferences, data?.timezone as string | null | undefined);
}

export async function savePushNotificationPrefs(
  next: PushNotificationPrefs,
): Promise<{ ok: true; prefs: PushNotificationPrefs } | { ok: false; error: string; status: number }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "supabase_not_configured", status: 503 };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized", status: 401 };

  const prefs = sanitizePushPrefs(next);
  const { data: existing } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .maybeSingle();

  const merged = mergePushSliceIntoPreferences(existing?.preferences, prefs);
  const { error } = await supabase
    .from("profiles")
    .update({ preferences: merged, timezone: prefs.quietHours.timezone })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, prefs };
}
