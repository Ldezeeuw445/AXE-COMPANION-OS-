import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMarketContext } from "@/lib/market/marketContextService";

export type ProactiveWatcherSummary = {
  usersChecked: number;
  eventsCreated: number;
  pushesSent: number;
  errors: string[];
};

type WatcherUser = {
  id: string;
};

async function firePush(userId: string, title: string, body: string, url: string): Promise<boolean> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL ?? "localhost:3000"}`;
    const res = await fetch(`${baseUrl}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title, body, url }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function recordProactiveEvent(
  supabase: SupabaseClient,
  userId: string,
  eventKey: string,
  title: string,
  body: string,
  url: string,
): Promise<boolean> {
  const { error } = await supabase.from("axe_proactive_events").insert({
    user_id: userId,
    event_key: eventKey,
    title,
    body,
    url,
  });
  if (error) {
    if (error.code === "23505") return false;
    throw error;
  }
  return true;
}

async function checkUser(supabase: SupabaseClient, userId: string): Promise<{ created: number; pushed: number }> {
  let created = 0;
  let pushed = 0;

  const { data: prefs } = await supabase
    .from("user_workspace_preferences")
    .select("active_broker_account_id")
    .eq("user_id", userId)
    .maybeSingle();

  const accountId = prefs?.active_broker_account_id as string | undefined;

  const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();

  const [recentTradesRes, positionsRes, pendingExecRes, pushRes] = await Promise.all([
    accountId
      ? supabase
          .from("broker_trades")
          .select("id,symbol,side,pnl,close_time")
          .eq("user_id", userId)
          .eq("account_id", accountId)
          .not("close_time", "is", null)
          .gte("close_time", since)
          .order("close_time", { ascending: false })
          .limit(3)
      : supabase
          .from("broker_trades")
          .select("id,symbol,side,pnl,close_time")
          .eq("user_id", userId)
          .not("close_time", "is", null)
          .gte("close_time", since)
          .order("close_time", { ascending: false })
          .limit(3),
    accountId
      ? supabase
          .from("mt5_positions")
          .select("id,symbol,type,volume")
          .eq("user_id", userId)
          .eq("account_id", accountId)
      : supabase.from("mt5_positions").select("id,symbol,type,volume").eq("user_id", userId),
    supabase
      .from("execution_requests")
      .select("id,instrument,direction,entry_price,status,created_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.from("push_subscriptions").select("id").eq("user_id", userId).limit(1),
  ]);

  const hasPush = (pushRes.data?.length ?? 0) > 0;
  const positions = positionsRes.data ?? [];
  const pendingExec = pendingExecRes.data ?? [];

  for (const trade of recentTradesRes.data ?? []) {
    const pnl = Number(trade.pnl ?? 0);
    const eventKey = `trade_close:${trade.id}`;
    const title = `Trade closed: ${trade.symbol}`;
    const body = `${trade.side} ${pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2)} — cockpit & journal updated`;
    const inserted = await recordProactiveEvent(supabase, userId, eventKey, title, body, "/cockpit");
    if (inserted) {
      created += 1;
      if (hasPush && (await firePush(userId, `AXE · ${title}`, body, "/cockpit"))) pushed += 1;
    }
  }

  for (const req of pendingExec) {
    const ageMs = Date.now() - new Date(req.created_at as string).getTime();
    if (ageMs < 5 * 60 * 1000) continue;
    const eventKey = `exec_pending:${req.id}`;
    const title = `Trade ready for review: ${req.instrument}`;
    const body = `${String(req.direction ?? "").toUpperCase()} @ ${req.entry_price ?? "market"} — tap to approve`;
    const inserted = await recordProactiveEvent(supabase, userId, eventKey, title, body, "/actions");
    if (inserted) {
      created += 1;
      if (hasPush && (await firePush(userId, `AXE · ${title}`, body, "/actions"))) pushed += 1;
    }
  }

  if (positions.length > 0) {
    const symbols = [...new Set(positions.map((p) => String(p.symbol ?? "").toUpperCase()).filter(Boolean))];
    const focus = symbols[0] ?? "XAUUSD";
    try {
      const market = await buildMarketContext({ symbol: focus, watchlist: symbols, newsLimit: 4, calendarLimit: 8 });
      const highEvents = (market.events ?? []).filter((e) => {
        const t = new Date(e.startsAt).getTime();
        const delta = t - Date.now();
        return e.impact === "high" && delta > 0 && delta < 45 * 60 * 1000;
      });
      if (highEvents.length > 0) {
        const ev = highEvents[0];
        const eventKey = `news_risk:${ev.title.slice(0, 40)}:${ev.startsAt}`;
        const title = `News risk: ${ev.currency ?? ""} ${ev.title}`.trim();
        const mins = Math.round((new Date(ev.startsAt).getTime() - Date.now()) / 60000);
        const body = `High-impact event in ~${mins}m — you have ${positions.length} open position(s)`;
        const inserted = await recordProactiveEvent(supabase, userId, eventKey, title, body, "/positions");
        if (inserted) {
          created += 1;
          if (hasPush && (await firePush(userId, `AXE · ${title}`, body, "/positions"))) pushed += 1;
        }
      }
    } catch {
      /* calendar optional */
    }
  }

  return { created, pushed };
}

export async function runAxeProactiveWatcher(
  supabase: SupabaseClient,
  opts?: { maxUsers?: number },
): Promise<ProactiveWatcherSummary> {
  const maxUsers = opts?.maxUsers ?? 25;
  const errors: string[] = [];
  let eventsCreated = 0;
  let pushesSent = 0;

  const { data: users, error } = await supabase
    .from("push_subscriptions")
    .select("user_id")
    .limit(maxUsers * 3);

  if (error) {
    return { usersChecked: 0, eventsCreated: 0, pushesSent: 0, errors: [error.message] };
  }

  const uniqueUsers: WatcherUser[] = [];
  const seen = new Set<string>();
  for (const row of users ?? []) {
    const id = row.user_id as string;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    uniqueUsers.push({ id });
    if (uniqueUsers.length >= maxUsers) break;
  }

  if (uniqueUsers.length === 0) {
    const { data: tradeUsers } = await supabase
      .from("broker_trades")
      .select("user_id")
      .gte("close_time", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(maxUsers);
    for (const row of tradeUsers ?? []) {
      const id = row.user_id as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      uniqueUsers.push({ id });
    }
  }

  for (const user of uniqueUsers) {
    try {
      const result = await checkUser(supabase, user.id);
      eventsCreated += result.created;
      pushesSent += result.pushed;
    } catch (e) {
      errors.push(`${user.id}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return {
    usersChecked: uniqueUsers.length,
    eventsCreated,
    pushesSent,
    errors,
  };
}
