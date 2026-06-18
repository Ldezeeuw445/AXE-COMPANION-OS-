"use server";

import { revalidatePath } from "next/cache";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { executeExecutionRequestOnMt5 } from "@/services/executionRequestExecutionService";

export async function approveExecutionRequestAction(
  id: string,
): Promise<{ ok: boolean; message?: string }> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return { ok: false, message: "Sign in required." };

  const result = await executeExecutionRequestOnMt5(authed.supabase, authed.user.id, id);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath("/actions");
  revalidatePath("/feed");
  revalidatePath("/positions");
  return { ok: true, message: result.message };
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
