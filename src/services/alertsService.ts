import { mockAlerts } from "@/services/mock/seed";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import type { AlertItem } from "@/types/domain";

export async function listAlerts(): Promise<AlertItem[]> {
  const authed = await getAuthedServiceSupabase();

  if (!authed) {
    return mockAlerts;
  }

  const { data, error } = await authed.supabase
    .from("alerts")
    .select("id,type,title,body,read,created_at,related_ref_type,related_ref_id")
    .eq("user_id", authed.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[alertsService] listAlerts error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    read: row.read ?? false,
    createdAt: row.created_at,
    relatedRefType: row.related_ref_type,
    relatedRefId: row.related_ref_id,
  }));
}

export async function setAlertRead(id: string, read: boolean): Promise<void> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return;
  await authed.supabase
    .from("alerts")
    .update({ read })
    .eq("id", id)
    .eq("user_id", authed.user.id);
}
