"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ALERT_TYPES = ["price", "news", "risk", "system"] as const;
export type ManualAlertType = (typeof ALERT_TYPES)[number];

function normalizeType(raw: string): ManualAlertType {
  const t = raw.toLowerCase();
  if (ALERT_TYPES.includes(t as ManualAlertType)) return t as ManualAlertType;
  return "system";
}

export type AlertMutationResult = { ok: true } | { ok: false; error: string };

export async function createManualAlertAction(
  _prev: AlertMutationResult | undefined,
  formData: FormData
): Promise<AlertMutationResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const type = normalizeType(String(formData.get("type") ?? "system"));

  if (!title) return { ok: false, error: "Title is required." };

  const { error } = await supabase.from("alerts").insert({
    user_id: user.id,
    type,
    title,
    body,
    read: false,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/alerts");
  return { ok: true };
}

export async function deleteAlertAction(alertId: string): Promise<AlertMutationResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("alerts")
    .delete()
    .eq("id", alertId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/alerts");
  return { ok: true };
}
