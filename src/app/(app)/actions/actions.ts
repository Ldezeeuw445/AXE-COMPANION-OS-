"use server";

import { revalidatePath } from "next/cache";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";

export async function approveExecutionRequestAction(id: string): Promise<{ ok: boolean; message?: string }> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return { ok: false, message: "Sign in required." };

  const { error } = await authed.supabase
    .from("execution_requests")
    .update({ status: "approved" })
    .eq("id", id)
    .eq("user_id", authed.user.id);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/actions");
  return { ok: true };
}

export async function rejectExecutionRequestAction(id: string): Promise<{ ok: boolean; message?: string }> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return { ok: false, message: "Sign in required." };

  const { error } = await authed.supabase
    .from("execution_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", authed.user.id);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/actions");
  return { ok: true };
}
