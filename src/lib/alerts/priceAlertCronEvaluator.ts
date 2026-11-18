/**
 * Server-side price-alert evaluation for `user_alerts` rows from any source
 * (Companion UI or Trading OS). Claim + feed + push only — never auto-trade.
 * TOS rows have no Companion-only metadata; `auto_trade_enabled` defaults to
 * true in the client trigger path, so this cron must not call that path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { claimAlertTrigger } from "@/lib/alerts/alertTriggerClaim";
import {
  isEvaluablePriceAlert,
  normalizeAlertSymbol,
  planPriceAlertActions,
  priceAlertCooldownSeconds,
  quotesFromSnapshots,
  withLastEvalPrice,
  type PriceAlertRow,
  type SnapshotQuoteRow,
} from "@/lib/alerts/tosPriceAlert";
import { chartDeepLink } from "@/lib/feed/feedDeepLinks";

export type PriceAlertPushFn = (input: {
  userId: string;
  title: string;
  body: string;
  url: string;
  eventKey: string;
  symbol?: string | null;
}) => Promise<boolean>;

export type PriceAlertFeedFn = (
  supabase: SupabaseClient,
  userId: string,
  eventKey: string,
  title: string,
  body: string,
  url: string,
) => Promise<boolean>;

export type EvaluatePriceAlertsOpts = {
  hasPush?: boolean;
  accountId?: string | null;
  quotes?: Record<string, number>;
  nowIso?: string;
  firePush?: PriceAlertPushFn;
  recordFeed?: PriceAlertFeedFn;
};

export async function evaluatePriceAlertsForUser(
  supabase: SupabaseClient,
  userId: string,
  opts: EvaluatePriceAlertsOpts = {},
): Promise<{ triggered: number; pushed: number; baselined: number }> {
  let triggered = 0;
  let pushed = 0;
  let baselined = 0;
  const hasPush = opts.hasPush ?? false;
  const nowIso = opts.nowIso ?? new Date().toISOString();

  const { data: alertRows } = await supabase
    .from("user_alerts")
    .select("id,user_id,symbol,type,condition,threshold,status,triggered_at,account_id,metadata")
    .eq("user_id", userId)
    .eq("status", "active");

  const alerts = ((alertRows ?? []) as PriceAlertRow[]).filter(isEvaluablePriceAlert);
  if (alerts.length === 0) return { triggered, pushed, baselined };

  const quotes = opts.quotes ?? (await loadSnapshotQuotes(supabase, userId, opts.accountId));
  const actions = planPriceAlertActions(alerts, quotes);

  for (const action of actions) {
    if (action.kind === "baseline") {
      await supabase
        .from("user_alerts")
        .update({ metadata: withLastEvalPrice(action.alert, action.price, nowIso) })
        .eq("id", action.alert.id)
        .eq("user_id", userId);
      baselined += 1;
      continue;
    }

    const display = normalizeAlertSymbol(action.alert.symbol) || action.alert.symbol;
    const metadata = withLastEvalPrice(action.alert, action.price, nowIso, {
      last_trigger_price: action.price,
      last_trigger_message: action.message,
      last_trigger_at: nowIso,
    });

    const claim = await claimAlertTrigger(supabase, {
      alertId: action.alert.id,
      userId,
      nowIso,
      cooldownSeconds: priceAlertCooldownSeconds(action.alert),
      metadata,
    });
    if (!claim.claimed) continue;

    triggered += 1;
    const feedUrl = display ? chartDeepLink(display) : "/alerts";
    const title = `Alert · ${display ?? action.alert.type}`;
    if (opts.recordFeed) {
      await opts.recordFeed(supabase, userId, `alert:${action.alert.id}:${nowIso}`, title, action.message, feedUrl);
    }
    if (hasPush && opts.firePush) {
      const ok = await opts.firePush({
        userId,
        title,
        body: action.message,
        url: feedUrl,
        eventKey: `price_alert:${action.alert.id}:${nowIso}`,
        symbol: display,
      });
      if (ok) pushed += 1;
    }
  }

  return { triggered, pushed, baselined };
}

async function loadSnapshotQuotes(
  supabase: SupabaseClient,
  userId: string,
  accountId?: string | null,
): Promise<Record<string, number>> {
  let query = supabase
    .from("chart_live_snapshots")
    .select("display_symbol,last_price,last_bid,last_ask,timeframe,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (accountId) query = query.eq("account_id", accountId);
  const { data } = await query;
  return quotesFromSnapshots((data ?? []) as SnapshotQuoteRow[]);
}
