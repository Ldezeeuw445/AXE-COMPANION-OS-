import {
  mockExecutionCards,
  mockSetupReviews,
} from "@/services/mock/seed";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import type { ExecutionRequestCard, SetupReviewCard } from "@/types/domain";

export async function listExecutionRequests(): Promise<ExecutionRequestCard[]> {
  const authed = await getAuthedServiceSupabase();

  if (!authed) {
    return mockExecutionCards;
  }

  const { data, error } = await authed.supabase
    .from("execution_requests")
    .select("id,instrument,direction,entry_price,stop_loss,take_profit,risk_amount,risk_percent,volume_lots,rationale,status")
    .eq("user_id", authed.user.id)
    .in("status", ["pending", "pending_approval", "draft"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[actionsService] listExecutionRequests error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    instrument: row.instrument ?? "Unknown",
    direction: row.direction ?? "flat",
    entry: row.entry_price ?? null,
    stopLoss: row.stop_loss ?? null,
    takeProfit: row.take_profit ?? null,
    riskPercent: row.risk_percent ?? null,
    volumeLots: row.volume_lots != null ? Number(row.volume_lots) : null,
    rationale: row.rationale ?? "",
    status:
      row.status === "pending"
        ? "pending_approval"
        : row.status === "executed"
          ? "executed"
        : row.status === "cancelled"
          ? "cancelled"
          : row.status ?? "pending_approval",
  }));
}

export async function listSetupReviews(): Promise<SetupReviewCard[]> {
  const authed = await getAuthedServiceSupabase();

  if (!authed) {
    return mockSetupReviews;
  }

  const { data, error } = await authed.supabase
    .from("setup_reviews")
    .select("id,instrument,direction,summary,status")
    .eq("user_id", authed.user.id)
    .in("status", ["pending", "in_review"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[actionsService] listSetupReviews error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    instrument: row.instrument ?? "Unknown",
    direction: row.direction ?? null,
    summary: row.summary ?? "",
    status:
      row.status === "approved"
        ? "approved"
        : row.status === "rejected"
          ? "rejected"
          : row.status === "in_review"
            ? "in_review"
            : "pending",
  }));
}

export async function approveExecutionRequest(
  id: string
): Promise<{ ok: boolean }> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return { ok: false };

  const { error } = await authed.supabase
    .from("execution_requests")
    .update({ status: "approved" })
    .eq("id", id)
    .eq("user_id", authed.user.id);

  return { ok: !error };
}
