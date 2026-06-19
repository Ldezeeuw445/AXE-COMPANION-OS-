import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { chartDeepLink } from "@/lib/feed/feedDeepLinks";
import type { AxeFeedItem } from "@/types/feed";

export { countUnreadFeedItems } from "@/lib/feed/feedUnread";

export async function listAxeFeedItems(limit = 40): Promise<AxeFeedItem[]> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return [];

  const [eventsRes, execRes, chartRes] = await Promise.all([
    authed.supabase
      .from("axe_proactive_events")
      .select("id,title,body,url,created_at")
      .eq("user_id", authed.user.id)
      .order("created_at", { ascending: false })
      .limit(limit),
    authed.supabase
      .from("execution_requests")
      .select("id,instrument,direction,entry_price,rationale,created_at")
      .eq("user_id", authed.user.id)
      .in("status", ["pending", "pending_approval", "draft"])
      .order("created_at", { ascending: false })
      .limit(10),
    authed.supabase
      .from("axe_pending_chart_actions")
      .select("id,action_type,symbol,timeframe,created_at")
      .eq("user_id", authed.user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const proactive: AxeFeedItem[] = (eventsRes.data ?? []).map((row) => ({
    id: `proactive:${row.id}`,
    kind: "proactive" as const,
    title: String(row.title ?? "AXE"),
    body: String(row.body ?? ""),
    url: (row.url as string | null) ?? null,
    createdAt: String(row.created_at),
  }));

  const drafts: AxeFeedItem[] = (execRes.data ?? []).map((row) => {
    const instrument = String(row.instrument ?? "").trim().toUpperCase();
    return {
      id: `exec:${row.id}`,
      kind: "trade_draft" as const,
      title: `Trade ready: ${instrument || "—"}`,
      body: `${String(row.direction ?? "").toUpperCase()} @ ${row.entry_price ?? "market"} — ${row.rationale ?? "Review and approve"}`,
      url: "/actions",
      createdAt: String(row.created_at),
    };
  });

  const chartActions: AxeFeedItem[] = (chartRes.data ?? []).map((row) => {
    const tf = String(row.timeframe ?? "h1").toUpperCase();
    const sym = String(row.symbol ?? "");
    const action = String(row.action_type ?? "draw").replace(/_/g, " ");
    return {
      id: `chart:${row.id}`,
      kind: "chart_action" as const,
      title: `Chart queued: ${sym} ${tf}`,
      body: action.charAt(0).toUpperCase() + action.slice(1),
      url: chartDeepLink(sym, String(row.timeframe ?? "h1")),
      createdAt: String(row.created_at),
    };
  });

  return [...proactive, ...drafts, ...chartActions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
