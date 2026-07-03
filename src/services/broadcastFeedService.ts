import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

export type BroadcastType = "daily_news" | "market_recap";

export type BroadcastFeedUpsertInput = {
  broadcastType: BroadcastType;
  title: string;
  body: string;
  contentDate: string;
  externalKey?: string;
  source?: string;
};

export function amsterdamContentDate(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

export function amsterdamHourMinute(date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

/** True during the 30-minute sync window after each Krater scheduled run. */
export function isKraterSyncWindow(broadcastType: BroadcastType, date = new Date()): boolean {
  const { hour, minute } = amsterdamHourMinute(date);
  if (broadcastType === "daily_news") return hour === 7 && minute < 30;
  return hour === 20 && minute < 30;
}

export async function broadcastAlreadySyncedToday(
  broadcastType: BroadcastType,
  contentDate?: string,
): Promise<boolean> {
  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return false;

  const date = contentDate ?? amsterdamContentDate();
  const { data, error } = await supabase
    .from("axe_broadcast_feed")
    .select("id")
    .eq("broadcast_type", broadcastType)
    .eq("content_date", date)
    .maybeSingle();

  if (error) {
    console.warn("[broadcastFeed] exists check failed", error.message);
    return false;
  }
  return Boolean(data?.id);
}

export async function upsertBroadcastFeedItem(input: BroadcastFeedUpsertInput) {
  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    throw new Error("Database unavailable");
  }

  const externalKey =
    input.externalKey ?? `${input.broadcastType}:${input.contentDate}`;

  const { data, error } = await supabase
    .from("axe_broadcast_feed")
    .upsert(
      {
        broadcast_type: input.broadcastType,
        title: input.title,
        body: input.body,
        content_date: input.contentDate,
        source: input.source ?? "krater",
        external_key: externalKey,
      },
      { onConflict: "broadcast_type,content_date" },
    )
    .select("id,broadcast_type,content_date,created_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
