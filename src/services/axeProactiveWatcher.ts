import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMarketContext } from "@/lib/market/marketContextService";
import { evaluateSmartAlertsForUser } from "@/services/smartAlertCronEvaluator";
import { type PushCategory } from "@/lib/push/categories";
import { dispatchPushEvent } from "@/lib/push/dispatch";
import { buildAccountProfile, newsWarningFor } from "@/lib/risk/accountProfile";
import { detectConcentration, weekendExposureWarning } from "@/lib/risk/positionRisk";
import { detectWeakSpots } from "@/lib/journal/weakSpots";
import {
  derivePlaybookEdges,
  edgeNoticeParts,
  edgeOpenNow,
  EDGE_MARGIN,
  SESSION_LABELS,
} from "@/lib/journal/playbookEdge";
import { getChartSetup } from "@/services/chartSetupService";
import { loadWeakSpotTrades } from "@/services/weakSpotService";
import { brokerHealthWarning } from "@/lib/risk/brokerHealth";
import {
  renderNoticeBody,
  signedAmount,
  type ProactiveNotice,
} from "@/lib/axe/notice";
import { tradeHistoryProvenance } from "@/lib/axe/provenance";
import {
  collectWatcherCandidates,
  isBrokerConnectionStale,
  TRADE_CLOSE_LOOKBACK_MS,
  tradeCloseEventKey,
} from "@/lib/axe/watcherCandidates";
import {
  figuresFromMetadata,
  liveEquitySnapshotFromMetadata,
  positionsFromAccountMetadata,
} from "@/lib/mt5/liveAccountSnapshot";
import { evaluateDrawdownAlerts } from "@/lib/risk/drawdownAlert";

export type ProactiveWatcherSummary = {
  usersChecked: number;
  eventsCreated: number;
  pushesSent: number;
  errors: string[];
};

type WatcherUser = {
  id: string;
};

async function firePush(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  url: string,
  category: PushCategory,
  eventKey: string,
  extra?: { symbol?: string; timeframe?: string; threadId?: string },
): Promise<boolean> {
  const result = await dispatchPushEvent({
    userId,
    category,
    eventKey,
    title,
    body,
    url,
    symbol: extra?.symbol,
    timeframe: extra?.timeframe,
    threadId: extra?.threadId,
    supabase,
  });
  return result.ok && result.sent > 0;
}

/**
 * Record one notice, and push it if the trader has push on.
 *
 * Both used to be done by hand at each of the seven producers below, with the
 * title, body and URL repeated three times per notice and the push arguments
 * drifting from the feed row's. Worse, every producer decided for itself
 * whether to say anything beyond what had happened — and most did not, which
 * is what this whole change is about. The notice type will not let a producer
 * skip the next step now, and this is the only place that writes one.
 */
async function announce(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    eventKey: string;
    notice: ProactiveNotice;
    category: PushCategory;
    hasPush: boolean;
    extra?: { symbol?: string; timeframe?: string; threadId?: string };
  },
): Promise<{ created: number; pushed: number }> {
  const body = renderNoticeBody(opts.notice);
  const { error } = await supabase.from("axe_proactive_events").insert({
    user_id: userId,
    event_key: opts.eventKey,
    title: opts.notice.title,
    body,
    url: opts.notice.action.href,
  });
  if (error) {
    // Duplicate event key: already said, and saying it twice is how a useful
    // notice becomes one the trader swipes away without reading.
    if (error.code === "23505") return { created: 0, pushed: 0 };
    throw error;
  }

  const pushed =
    opts.hasPush &&
    (await firePush(
      supabase,
      userId,
      `AXE · ${opts.notice.title}`,
      body,
      opts.notice.action.href,
      opts.category,
      opts.eventKey,
      opts.extra,
    ))
      ? 1
      : 0;

  return { created: 1, pushed };
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

  const since = new Date(Date.now() - TRADE_CLOSE_LOOKBACK_MS).toISOString();

  const [recentTradesRes, positionsRes, pendingExecRes, pushRes] = await Promise.all([
    accountId
      ? supabase
          .from("broker_trades")
          .select("id,external_trade_id,symbol,side,pnl,close_time")
          .eq("user_id", userId)
          .eq("account_id", accountId)
          .not("close_time", "is", null)
          .gte("close_time", since)
          .order("close_time", { ascending: false })
          .limit(20)
      : supabase
          .from("broker_trades")
          .select("id,external_trade_id,symbol,side,pnl,close_time")
          .eq("user_id", userId)
          .not("close_time", "is", null)
          .gte("close_time", since)
          .order("close_time", { ascending: false })
          .limit(20),
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
  const tablePositions = (positionsRes.data ?? []).map((p) => ({
    id: String(p.id ?? ""),
    symbol: String(p.symbol ?? ""),
    type: String(p.type ?? ""),
    volume: Number(p.volume ?? 0),
  }));
  const metaPositions = positionsFromAccountMetadata(
    (accountRow?.metadata as Record<string, unknown> | null) ?? null,
  ).map((p) => ({
    id: p.id,
    symbol: p.symbol,
    type: p.side,
    volume: p.volume,
  }));
  const positions = tablePositions.length > 0 ? tablePositions : metaPositions;
  const pendingExec = pendingExecRes.data ?? [];

  for (const trade of recentTradesRes.data ?? []) {
    const pnl = Number(trade.pnl ?? 0);
    const result = await announce(supabase, userId, {
      eventKey: tradeCloseEventKey({
        id: String(trade.id),
        external_trade_id: (trade.external_trade_id as string | null) ?? null,
      }),
      category: "axe_finding",
      hasPush,
      extra: { symbol: String(trade.symbol ?? "") },
      notice: {
        title: `Trade closed: ${trade.symbol}`,
        what: `${trade.side} ${signedAmount(pnl)}`,
        // The old body said "cockpit & journal updated", which describes the
        // app's housekeeping rather than anything about the trade. What a
        // trader wants to know at this moment is whether AXE agreed with it.
        soWhat: "AXE has scored it against your rules and playbooks.",
        action: { label: "Read AXE's verdict on it", href: "/journal" },
      },
    });
    created += result.created;
    pushed += result.pushed;
  }

  for (const req of pendingExec) {
    const ageMs = Date.now() - new Date(req.created_at as string).getTime();
    if (ageMs < 5 * 60 * 1000) continue;
    const minutes = Math.round(ageMs / 60_000);
    const result = await announce(supabase, userId, {
      eventKey: `exec_pending:${req.id}`,
      category: "axe_finding",
      hasPush,
      extra: { symbol: String(req.instrument ?? "") },
      notice: {
        title: `Trade ready for review: ${req.instrument}`,
        what: `${String(req.direction ?? "").toUpperCase()} @ ${req.entry_price ?? "market"}`,
        // The age is the point: a setup that was valid twenty minutes ago may
        // not be now, and nothing has reached the broker either way.
        soWhat: `Waiting ${minutes}m — nothing goes to your broker until you approve it.`,
        action: { label: "Approve or discard it", href: "/actions" },
      },
    });
    created += result.created;
    pushed += result.pushed;
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
          // `newsWarningFor` already names the account's rules and what they
          // mean here — that is its whole job — so its body is the `soWhat`
          // and the only thing missing was somewhere to go.
          const result = await announce(supabase, userId, {
            eventKey: `news_risk:${ev.title.slice(0, 40)}:${ev.startsAt}`,
            category: "economic_event",
            hasPush,
            extra: { symbol: focus, timeframe: "m15" },
            notice: {
              title: warning.title,
              what: warning.body,
              soWhat: null,
              action:
                positions.length > 0
                  ? { label: `Check your ${positions.length} open position${positions.length === 1 ? "" : "s"}`, href: "/positions" }
                  : { label: "See what else is due today", href: "/feed" },
            },
          });
          created += result.created;
          pushed += result.pushed;
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
      const result = await announce(supabase, userId, {
        eventKey: `broker_health:${accountId ?? "none"}:${health.kind}:${new Date().toISOString().slice(0, 10)}`,
        category: "broker_disconnect",
        hasPush,
        notice: {
          title: health.title,
          what: health.body,
          // The consequence is the part a trader cannot work out for
          // themselves, and it is the one that matters: a dead feed means
          // every other thing AXE says is running on stale prices.
          soWhat: "Until this is back, AXE is working from stale prices and cannot place or close anything.",
          action: { label: "Reconnect the account", href: "/accounts" },
        },
      });
      created += result.created;
      pushed += result.pushed;
    }
  }

  /* ── Firm drawdown / daily-limit, from last known live equity ───── */
  if (accountId) {
    const figures = figuresFromMetadata((accountRow?.metadata as Record<string, unknown> | null) ?? null);
    const snap = figures
      ? liveEquitySnapshotFromMetadata((accountRow?.metadata as Record<string, unknown> | null) ?? null, figures)
      : null;
    if (snap) {
      const ddAlerts = evaluateDrawdownAlerts({
        accountId,
        constraints: accountProfile,
        snap,
      });
      for (const alert of ddAlerts) {
        const result = await announce(supabase, userId, {
          eventKey: alert.eventKey,
          category: "risk_alert",
          hasPush,
          notice: alert.notice,
        });
        created += result.created;
        pushed += result.pushed;
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
      const result = await announce(supabase, userId, {
        eventKey: `concentration:${top.id}:${top.symbols.join("+")}:${new Date().toISOString().slice(0, 10)}`,
        category: "risk_alert",
        hasPush,
        extra: { symbol: top.symbols[0] },
        notice: {
          title: top.title,
          what: top.body,
          // Several tickets feel like several decisions. The risk is that they
          // move together, which is the thing the ticket count hides.
          soWhat: `These move together, so your real exposure is one bet, not ${positions.length}.`,
          action: { label: "See the stack", href: "/positions" },
        },
      });
      created += result.created;
      pushed += result.pushed;
    }
  }

  /* ── Friday: the clock, not the chart ───────────────────────────── */
  const weekend = weekendExposureWarning(
    new Date(),
    positions.length,
    accountProfile.weekendHoldingAllowed,
  );
  if (weekend) {
    const result = await announce(supabase, userId, {
      eventKey: `weekend:${new Date().toISOString().slice(0, 10)}`,
      category: "risk_alert",
      hasPush,
      notice: {
        title: weekend.title,
        what: weekend.body,
        // Two different reasons depending on the account, and the trader
        // should know which one applies to them — a rule they can breach is
        // not the same risk as a gap they can only sit through.
        soWhat: accountProfile.weekendHoldingAllowed
          ? "The market reopens with a gap, and your stop cannot fill inside it."
          : `This account's rules do not allow it — ${accountProfile.description}.`,
        action: { label: "Review before the close", href: "/positions" },
      },
    });
    created += result.created;
    pushed += result.pushed;
  }

  /* ── Your own most expensive habit, once a week ─────────────────── */
  // One load, two readings. `weakSpots` finds what is going wrong and says
  // stop; `playbookEdge` finds the conditions this trader actually makes money
  // in. The second was build-list item 3.4 and the thing Luka asked for most
  // often: AXE that comes to you with something of its own accord instead of
  // only ever applying a brake.
  const edgeTrades = await loadWeakSpotTrades(supabase, userId, accountId);
  try {
    const spots = detectWeakSpots(edgeTrades);
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
      // `evidence` is the measurement and `proposal` is what to do about it,
      // which is exactly the split the notice type wants — they used to be
      // concatenated into one string and read as a single paragraph.
      const result = await announce(supabase, userId, {
        eventKey: `weakspot:${top.id}:${weekStamp}`,
        category: "axe_finding",
        hasPush,
        notice: {
          title: top.title,
          what: top.evidence,
          soWhat: top.proposal,
          action: { label: "See the trades behind it", href: "/journal" },
        },
      });
      created += result.created;
      pushed += result.pushed;
    }
  } catch {
    /* weak spots are an extra, never a reason the watcher fails */
  }

  /* ── Your own best ground, while you are standing on it ─────────── */
  try {
    const edges = derivePlaybookEdges(edgeTrades);
    // Their saved chart list: an edge on an instrument they are not even
    // looking at today is not worth a notification. Empty means no filter,
    // which is right for a trader who has never saved a chart.
    const setup = await getChartSetup(supabase, userId);
    const edge = edgeOpenNow(edges, new Date(), setup.symbols);
    if (edge) {
      // One per edge per day. The session comes round every day and the
      // record behind it barely moves, so saying it twice in one session
      // would be the fastest way to make a trader mute AXE.
      const parts = edgeNoticeParts(edge);
      const result = await announce(supabase, userId, {
        eventKey: `playbook_edge:${edge.id}:${new Date().toISOString().slice(0, 10)}`,
        category: "axe_finding",
        hasPush,
        extra: { symbol: edge.symbol },
        notice: {
          title: parts.title,
          what: parts.what,
          soWhat: parts.soWhat,
          action: { label: `See those ${edge.trades} trades`, href: "/journal" },
          // The first source wired through to the new provenance layer. The
          // numbers are the same ones the sentence is built from, so the
          // trader can check the claim against the trades rather than take
          // the sentence on trust.
          provenance: tradeHistoryProvenance({
            rule: `Your ${SESSION_LABELS[edge.session]} ${edge.symbol} ${edge.direction}s beat your own average by at least ${EDGE_MARGIN}x`,
            label: `Closed ${SESSION_LABELS[edge.session]} ${edge.symbol} ${edge.direction}s`,
            value: edge.evidence,
            trades: edge.trades,
            wins: edge.wins,
            observedAt: new Date().toISOString(),
          }),
        },
      });
      created += result.created;
      pushed += result.pushed;
    }
  } catch {
    /* same rule: an extra, never a reason the watcher fails */
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

  // Activity first. Connected-but-idle accounts used to fill the cap on an
  // unordered query, so the trader who had just closed XAUUSD was never in
  // the 30-user budget. Push only decides whether a push is *sent*.
  const { data: accountRows, error } = await supabase
    .from("user_broker_accounts")
    .select("user_id,metadata,last_sync_at,provider_status,status")
    .eq("status", "active")
    .limit(500);

  if (error) {
    return { usersChecked: 0, eventsCreated: 0, pushesSent: 0, errors: [error.message] };
  }

  const idsOf = (rows: Array<{ user_id?: string | null }> | null | undefined) =>
    (rows ?? []).map((r) => r.user_id).filter((id): id is string => typeof id === "string" && id.length > 0);

  const openPositionUserIds: string[] = [];
  const staleConnectionUserIds: string[] = [];
  for (const row of accountRows ?? []) {
    const id = row.user_id as string | undefined;
    if (!id) continue;
    if (positionsFromAccountMetadata(row.metadata).length > 0) openPositionUserIds.push(id);
    if (isBrokerConnectionStale(row.last_sync_at as string | null)) staleConnectionUserIds.push(id);
  }

  const [{ data: tradeUsers }, { data: execUsers }, { data: alertUsers }, { data: pushUsers }] = await Promise.all([
    supabase
      .from("broker_trades")
      .select("user_id")
      .gte("close_time", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(maxUsers * 4),
    supabase.from("execution_requests").select("user_id").eq("status", "pending").limit(maxUsers * 4),
    supabase
      .from("user_alerts")
      .select("user_id,metadata,type")
      .eq("status", "active")
      .in("type", ["position_risk", "news", "price"])
      .limit(maxUsers * 4),
    supabase.from("push_subscriptions").select("user_id").limit(maxUsers),
  ]);

  const smartAlertUserIds = (alertUsers ?? [])
    .filter((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return (
        Boolean(meta.smartKind) ||
        Boolean(meta.smartTitle) ||
        meta.evaluator === "smart" ||
        meta.evaluator === "position_risk"
      );
    })
    .map((row) => row.user_id as string);

  const candidateIds = collectWatcherCandidates(
    {
      recentTradeUserIds: idsOf(tradeUsers),
      pendingExecUserIds: [...idsOf(execUsers), ...smartAlertUserIds],
      openPositionUserIds,
      staleConnectionUserIds,
      activeAccountUserIds: idsOf(accountRows),
      pushUserIds: idsOf(pushUsers),
    },
    maxUsers,
  );
  const uniqueUsers: WatcherUser[] = candidateIds.map((id) => ({ id }));

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
