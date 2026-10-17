import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMarketContext } from "@/lib/market/marketContextService";
import { evaluateSmartAlertsForUser } from "@/services/smartAlertCronEvaluator";
import { internalPushHeaders } from "@/lib/push/internalPushAuth";
import { getPublicAppBaseUrl } from "@/lib/env";
import { buildAccountProfile, newsWarningFor } from "@/lib/risk/accountProfile";
import { detectConcentration, weekendExposureWarning } from "@/lib/risk/positionRisk";
import { detectWeakSpots } from "@/lib/journal/weakSpots";
import { loadWeakSpotTrades } from "@/services/weakSpotService";
import { brokerHealthWarning } from "@/lib/risk/brokerHealth";

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
    const baseUrl = getPublicAppBaseUrl();
    const res = await fetch(`${baseUrl}/api/push/send`, {
      method: "POST",
      headers: internalPushHeaders(),
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
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();

  const accountId = prefs?.active_account_id as string | undefined;

  // What kind of account this is decides whether a news warning is worth
  // sending at all. A demo account shrugs at NFP; a funded one can be closed
  // for trading through it.
  const { data: accountRow } = accountId
    ? await supabase
        .from("user_broker_accounts")
        .select("label,mt5_server,metadata,connection_method,provider_status,last_sync_at")
        .eq("user_id", userId)
        .eq("id", accountId)
        .maybeSingle()
    : { data: null };

  const accountProfile = buildAccountProfile({
    label: (accountRow?.label as string | null) ?? null,
    mt5Server: (accountRow?.mt5_server as string | null) ?? null,
    metadata: (accountRow?.metadata as Record<string, unknown> | null) ?? null,
    connectionMethod: (accountRow?.connection_method as string | null) ?? null,
  });

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

  // News risk. Deliberately NOT gated on having open positions: on an account
  // whose rules forbid trading through news, the useful moment is *before* the
  // trade, while staying flat is still a choice.
  const watchesNews = positions.length > 0 || !accountProfile.newsTradingAllowed;
  if (watchesNews) {
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
        const warning = newsWarningFor(accountProfile, {
          openPositions: positions.length,
          minutesUntil: (new Date(ev.startsAt).getTime() - Date.now()) / 60000,
          eventTitle: ev.title,
          currency: ev.currency ?? null,
        });
        if (warning) {
          const eventKey = `news_risk:${ev.title.slice(0, 40)}:${ev.startsAt}`;
          const url = positions.length > 0 ? "/positions" : "/feed";
          const inserted = await recordProactiveEvent(
            supabase,
            userId,
            eventKey,
            warning.title,
            warning.body,
            url,
          );
          if (inserted) {
            created += 1;
            if (hasPush && (await firePush(userId, `AXE · ${warning.title}`, warning.body, url))) pushed += 1;
          }
        }
      }
    } catch {
      /* calendar optional */
    }
  }

  /* ── Is the broker connection still delivering? ─────────────────── */
  if (accountRow) {
    const health = brokerHealthWarning({
      label: (accountRow.label as string | null) ?? null,
      providerStatus: (accountRow.provider_status as string | null) ?? null,
      lastSyncAt: (accountRow.last_sync_at as string | null) ?? null,
      connectionMethod: (accountRow.connection_method as string | null) ?? null,
    });
    if (health) {
      // One per account per day: a broken connection stays broken, and
      // repeating it every fifteen minutes would train the trader to swipe
      // it away — which is how this went unnoticed for eight days.
      const eventKey = `broker_health:${accountId ?? "none"}:${health.kind}:${new Date().toISOString().slice(0, 10)}`;
      const inserted = await recordProactiveEvent(
        supabase,
        userId,
        eventKey,
        health.title,
        health.body,
        "/accounts",
      );
      if (inserted) {
        created += 1;
        if (hasPush && (await firePush(userId, `AXE · ${health.title}`, health.body, "/accounts"))) {
          pushed += 1;
        }
      }
    }
  }

  /* ── Concentration: several tickets, one bet ────────────────────── */
  if (positions.length >= 2) {
    const clusters = detectConcentration(
      positions.map((p) => ({
        symbol: String(p.symbol ?? ""),
        side: (p.type ?? "") as string,
        volume: Number(p.volume ?? 0),
      })),
    );
    const top = clusters[0];
    if (top && top.severity >= 0.4) {
      // Keyed on the cluster, not the clock: re-opening the same stack
      // tomorrow is worth saying again, nagging every 15 minutes is not.
      const eventKey = `concentration:${top.id}:${top.symbols.join("+")}:${new Date().toISOString().slice(0, 10)}`;
      const inserted = await recordProactiveEvent(
        supabase,
        userId,
        eventKey,
        top.title,
        top.body,
        "/positions",
      );
      if (inserted) {
        created += 1;
        if (hasPush && (await firePush(userId, `AXE · ${top.title}`, top.body, "/positions"))) pushed += 1;
      }
    }
  }

  /* ── Friday: the clock, not the chart ───────────────────────────── */
  const weekend = weekendExposureWarning(
    new Date(),
    positions.length,
    accountProfile.weekendHoldingAllowed,
  );
  if (weekend) {
    const eventKey = `weekend:${new Date().toISOString().slice(0, 10)}`;
    const inserted = await recordProactiveEvent(
      supabase,
      userId,
      eventKey,
      weekend.title,
      weekend.body,
      "/positions",
    );
    if (inserted) {
      created += 1;
      if (hasPush && (await firePush(userId, `AXE · ${weekend.title}`, weekend.body, "/positions"))) pushed += 1;
    }
  }

  /* ── Your own most expensive habit, once a week ─────────────────── */
  try {
    const spots = detectWeakSpots(await loadWeakSpotTrades(supabase, userId, accountId));
    const top = spots[0];
    if (top && top.severity >= 0.5) {
      // One key per ISO week: this is a pattern, not news. Saying it daily
      // turns a useful observation into noise people learn to ignore.
      const weekStamp = (() => {
        const d = new Date();
        const monday = new Date(d);
        monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        return monday.toISOString().slice(0, 10);
      })();
      const eventKey = `weakspot:${top.id}:${weekStamp}`;
      const body = `${top.evidence} ${top.proposal}`;
      const inserted = await recordProactiveEvent(
        supabase,
        userId,
        eventKey,
        top.title,
        body,
        "/journal",
      );
      if (inserted) {
        created += 1;
        if (hasPush && (await firePush(userId, `AXE · ${top.title}`, body, "/journal"))) pushed += 1;
      }
    }
  } catch {
    /* weak spots are an extra, never a reason the watcher fails */
  }

  try {
    const smart = await evaluateSmartAlertsForUser(supabase, userId, {
      accountId: accountId ?? null,
      hasPush,
    });
    created += smart.triggered;
    pushed += smart.pushed;
  } catch {
    /* smart alerts optional */
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

  // Candidate users. Push subscriptions used to be the FIRST source and the
  // cap was filled from it, so anyone who had declined push notifications was
  // never checked at all — they got no feed items either, which is not what
  // declining a notification means. Push is now one source among several, and
  // only decides whether a push is *sent* (see `hasPush` in checkUser).
  const uniqueUsers: WatcherUser[] = [];
  const seen = new Set<string>();

  const addUsers = (rows: Array<Record<string, unknown>> | null | undefined) => {
    for (const row of rows ?? []) {
      if (uniqueUsers.length >= maxUsers) return;
      const id = row.user_id as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      uniqueUsers.push({ id });
    }
  };

  // Anyone with a connected broker account is in scope: they have positions
  // and rules worth watching whether or not they traded today.
  const { data: accountUsers, error } = await supabase
    .from("user_broker_accounts")
    .select("user_id")
    .eq("status", "active")
    .limit(maxUsers * 4);

  if (error) {
    return { usersChecked: 0, eventsCreated: 0, pushesSent: 0, errors: [error.message] };
  }
  addUsers(accountUsers as Array<Record<string, unknown>> | null);

  if (uniqueUsers.length < maxUsers) {
    const { data: tradeUsers } = await supabase
      .from("broker_trades")
      .select("user_id")
      .gte("close_time", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(maxUsers);
    addUsers(tradeUsers as Array<Record<string, unknown>> | null);
  }

  if (uniqueUsers.length < maxUsers) {
    const { data: execUsers } = await supabase
      .from("execution_requests")
      .select("user_id")
      .eq("status", "pending")
      .limit(maxUsers);
    addUsers(execUsers as Array<Record<string, unknown>> | null);
  }

  if (uniqueUsers.length < maxUsers) {
    const { data: alertUsers } = await supabase
      .from("user_alerts")
      .select("user_id,metadata,type")
      .eq("status", "active")
      .in("type", ["position_risk", "news", "price"])
      .limit(maxUsers * 4);
    const smartOnly = (alertUsers ?? []).filter((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return (
        Boolean(meta.smartKind) ||
        Boolean(meta.smartTitle) ||
        meta.evaluator === "smart" ||
        meta.evaluator === "position_risk"
      );
    });
    addUsers(smartOnly as Array<Record<string, unknown>>);
  }

  if (uniqueUsers.length < maxUsers) {
    const { data: pushUsers } = await supabase
      .from("push_subscriptions")
      .select("user_id")
      .limit(maxUsers);
    addUsers(pushUsers as Array<Record<string, unknown>> | null);
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
