import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { chartDeepLink } from "@/lib/feed/feedDeepLinks";
import { normalizeTradeVolume } from "@/lib/trading/tradeVolume";
import type { AxeFeedItem } from "@/types/feed";

export { countUnreadFeedItems } from "@/lib/feed/feedUnread";

/** How far back the feed timeline reaches. */
export const FEED_HISTORY_DAYS = 7;

function feedSinceIso(): string {
  return new Date(Date.now() - FEED_HISTORY_DAYS * 86_400_000).toISOString();
}

export async function listAxeFeedItems(limit = 80): Promise<AxeFeedItem[]> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return [];

  const since = feedSinceIso();

  const [eventsRes, execRes, chartRes, briefingsRes] = await Promise.all([
    authed.supabase
      .from("axe_proactive_events")
      .select("id,title,body,url,created_at")
      .eq("user_id", authed.user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    authed.supabase
      .from("execution_requests")
      .select("id,instrument,direction,entry_price,volume_lots,rationale,created_at")
      .eq("user_id", authed.user.id)
      .gte("created_at", since)
      .in("status", ["pending", "pending_approval", "draft"])
      .order("created_at", { ascending: false })
      .limit(15),
    authed.supabase
      .from("axe_pending_chart_actions")
      .select("id,action_type,symbol,timeframe,created_at")
      .eq("user_id", authed.user.id)
      .eq("status", "pending")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(15),
    authed.supabase
      .from("axe_daily_briefings")
      .select("id,title,body,briefing_type,briefing_date,chat_prefill,created_at")
      .eq("user_id", authed.user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(14),
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
    const lots =
      row.volume_lots != null
        ? normalizeTradeVolume(Number(row.volume_lots)).toFixed(2)
        : null;
    const sizeText = lots ? `${lots} lots · ` : "";
    return {
      id: `exec:${row.id}`,
      kind: "trade_draft" as const,
      title: `Trade ready: ${instrument || "—"}`,
      body: `${sizeText}${String(row.direction ?? "").toUpperCase()} @ ${row.entry_price ?? "market"} — ${row.rationale ?? "Review and approve"}`,
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

  const briefings: AxeFeedItem[] = (briefingsRes.data ?? []).map((row) => {
    const type = String(row.briefing_type ?? "daily");
    const prefill = String(row.chat_prefill ?? "").trim();
    return {
      id: `briefing:${row.id}`,
      kind: "briefing" as const,
      title: String(row.title ?? (type === "weekly" ? "Weekly Outlook" : "Morning Brief")),
      body: String(row.body ?? "").slice(0, 480),
      url: prefill ? `/chat?q=${encodeURIComponent(prefill)}` : "/chat",
      createdAt: String(row.created_at ?? row.briefing_date),
    };
  });

  return [...briefings, ...proactive, ...drafts, ...chartActions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
