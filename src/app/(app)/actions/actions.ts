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

export async function rejectExecutionRequestAction(
  id: string,
  reason?: string,
): Promise<{ ok: boolean; message?: string }> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return { ok: false, message: "Sign in required." };

  const { data: row } = await authed.supabase
    .from("execution_requests")
    .select("instrument,direction,entry_price,rationale,notes")
    .eq("id", id)
    .eq("user_id", authed.user.id)
    .maybeSingle();

  const trimmedReason = reason?.trim() ?? "";
  const rejectNote = trimmedReason ? `Rejected: ${trimmedReason}` : null;
  const mergedNotes = [row?.notes, rejectNote].filter(Boolean).join(" | ") || null;

  const { error } = await authed.supabase
    .from("execution_requests")
    .update({
      status: "cancelled",
      notes: mergedNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", authed.user.id);

  if (error) return { ok: false, message: error.message };

  if (trimmedReason && row) {
    const instrument = String(row.instrument ?? "trade");
    const direction = String(row.direction ?? "").toUpperCase();
    const entry = row.entry_price != null ? ` @ ${row.entry_price}` : "";
    await authed.supabase.from("assistant_memory_entries").insert({
      user_id: authed.user.id,
      scope: "execution_feedback",
      entry_key: `reject-${id}`,
      content: `[execution_reject] ${instrument} ${direction}${entry}: ${trimmedReason}`,
    });
  }

  revalidatePath("/actions");
  revalidatePath("/feed");
  return {
    ok: true,
    message: trimmedReason
      ? "Draft rejected — AXE will remember your feedback."
      : "Draft rejected.",
  };
}
