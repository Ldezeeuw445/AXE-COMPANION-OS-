import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAlpacaCandles } from "@/lib/alpaca/bars";
import { isAlpacaSupportedSymbol } from "@/lib/alpaca/symbols";
import {
  candlesFromMetaApi,
  evaluateContextAwareExposure,
  evaluateCorrelationCluster,
  evaluatePredictiveLevelBreak,
  evaluateSentimentShift,
  evaluateTechnicalConfluence,
  type OpenPosition,
} from "@/lib/alerts/smartAlertRules";
import { generateDemoCandles } from "@/lib/broker/demoAccount";
import { chartDeepLink } from "@/lib/feed/feedDeepLinks";
import { recordProactiveFeedEvent } from "@/lib/feed/recordProactiveFeedEvent";
import { buildMarketContext } from "@/lib/market/marketContextService";
import { hasEntitlementFeature } from "@/lib/billing/access";
import { getUserAxeEntitlement } from "@/services/billingService";

type AlertRow = {
  id: string;
  symbol: string | null;
  type: string;
  condition: string | null;
  status: string;
  triggered_at: string | null;
  metadata: Record<string, unknown> | null;
};

function smartKind(alert: AlertRow): string | null {
  const meta = alert.metadata ?? {};
  if (typeof meta.smartKind === "string") return meta.smartKind;
  if (alert.condition) return alert.condition;
  if (typeof meta.evaluator === "string") return meta.evaluator;
  return null;
}

function isSmartAlert(alert: AlertRow): boolean {
  const meta = alert.metadata ?? {};
  if (meta.evaluator === "smart" || meta.evaluator === "position_risk") return true;
  if (meta.smartKind || meta.smartTitle) return true;
  return false;
}

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

async function triggerAlert(
  supabase: SupabaseClient,
  userId: string,
  alert: AlertRow,
  message: string,
  hasPush: boolean,
  cooldownMs = 60 * 60 * 1000,
): Promise<{ triggered: boolean; pushed: boolean }> {
  if (alert.triggered_at) {
    const last = Date.parse(alert.triggered_at);
    if (Number.isFinite(last) && Date.now() - last < cooldownMs) {
      return { triggered: false, pushed: false };
    }
  }

  const now = new Date().toISOString();
  const metadata = {
    ...(alert.metadata && typeof alert.metadata === "object" ? alert.metadata : {}),
    last_trigger_message: message,
    last_trigger_at: now,
  };

  const { error } = await supabase
    .from("user_alerts")
    .update({ triggered_at: now, metadata })
    .eq("id", alert.id)
    .eq("user_id", userId);

  if (error) return { triggered: false, pushed: false };

  const feedUrl = alert.symbol ? chartDeepLink(alert.symbol) : "/alerts";
  await recordProactiveFeedEvent(
    supabase,
    userId,
    `alert:${alert.id}:${now}`,
    `Alert · ${alert.symbol ?? alert.type}`,
    message,
    feedUrl,
  );

  const title = `Alert · ${alert.symbol ?? alert.type}`;
  const pushed = hasPush && (await firePush(userId, title, message, feedUrl));
  return { triggered: true, pushed };
}

async function loadCandlesForSymbol(symbol: string): Promise<ReturnType<typeof candlesFromMetaApi>> {
  const sym = symbol.toUpperCase();
  const alpaca = isAlpacaSupportedSymbol(sym) ? await fetchAlpacaCandles(sym, "h1", 120) : null;
  if (alpaca?.length) return candlesFromMetaApi(alpaca);
  const demo = generateDemoCandles(sym, "h1", 120);
  return candlesFromMetaApi(demo);
}

async function loadWatchlist(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("assistant_memory_entries")
    .select("entry_key")
    .eq("user_id", userId)
    .eq("scope", "watchlist")
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => String(r.entry_key ?? "").toUpperCase()).filter(Boolean);
}

/** Server-side smart alert evaluation for all enabled templates. */
export async function evaluateSmartAlertsForUser(
  supabase: SupabaseClient,
  userId: string,
  opts?: { accountId?: string | null; hasPush?: boolean },
): Promise<{ triggered: number; pushed: number }> {
  let triggered = 0;
  let pushed = 0;
  const hasPush = opts?.hasPush ?? false;

  const entitlement = await getUserAxeEntitlement(supabase, userId);
  if (!hasEntitlementFeature(entitlement, "proactive_notifications", userId)) {
    return { triggered, pushed };
  }

  const { data: alerts } = await supabase
    .from("user_alerts")
    .select("id,symbol,type,condition,status,triggered_at,metadata")
    .eq("user_id", userId)
    .eq("status", "active");

  const smartAlerts = ((alerts ?? []) as AlertRow[]).filter(isSmartAlert);
  if (smartAlerts.length === 0) return { triggered, pushed };

  const accountId = opts?.accountId ?? null;
  const positionsQuery = supabase
    .from("mt5_positions")
    .select("id,symbol,type,stop_loss")
    .eq("user_id", userId);
  const { data: positionRows } = accountId
    ? await positionsQuery.eq("account_id", accountId)
    : await positionsQuery;

  const positions: OpenPosition[] = (positionRows ?? []).map((p) => ({
    symbol: String(p.symbol ?? ""),
    type: (p.type as string | null) ?? null,
    stop_loss: p.stop_loss != null ? Number(p.stop_loss) : null,
  }));

  const watchlist = await loadWatchlist(supabase, userId);
  const focusSymbol = watchlist[0] ?? "XAUUSD";
  const market = await buildMarketContext({
    symbol: focusSymbol,
    watchlist,
    positionsSymbols: positions.map((p) => p.symbol),
    newsLimit: 20,
  }).catch(() => null);

  const sentimentEval = market
    ? evaluateSentimentShift(market.news, watchlist)
    : { fire: false, message: "", avgSentiment: 0, headlineCount: 0 };

  let candleCache: Awaited<ReturnType<typeof loadCandlesForSymbol>> | null = null;

  for (const alert of smartAlerts) {
    const kind = smartKind(alert);
    let message: string | null = null;

    if (kind === "missing_sl" || (alert.type === "position_risk" && alert.metadata?.evaluator === "position_risk")) {
      const missingSl = positions.filter((p) => p.stop_loss == null || Number(p.stop_loss) <= 0);
      if (missingSl.length > 0) {
        const syms = [...new Set(missingSl.map((p) => p.symbol.toUpperCase()).filter(Boolean))];
        message =
          missingSl.length === 1
            ? `${syms[0] ?? "A position"} has no stop-loss — book unprotected.`
            : `${missingSl.length} positions have no stop-loss (${syms.slice(0, 3).join(", ")}${syms.length > 3 ? "…" : ""}).`;
      }
    } else if (kind === "correlation") {
      const threshold = Number(alert.metadata?.threshold ?? 0.8);
      const minSize = threshold >= 0.75 ? 3 : 2;
      const evalResult = evaluateCorrelationCluster(positions, minSize);
      if (evalResult.fire) message = evalResult.message;
    } else if (kind === "concentration" || kind === "context_aware") {
      const evalResult = evaluateContextAwareExposure(positions, sentimentEval.avgSentiment);
      if (evalResult.fire) message = evalResult.message;
    } else if (kind === "sentiment" || alert.type === "news") {
      if (sentimentEval.fire) message = sentimentEval.message;
    } else if (kind === "technical_confluence" || kind === "predictive") {
      const sym = (alert.symbol ?? focusSymbol).toUpperCase();
      if (!candleCache) candleCache = await loadCandlesForSymbol(sym);
      if (kind === "technical_confluence") {
        const evalResult = evaluateTechnicalConfluence(candleCache);
        if (evalResult.fire) message = evalResult.message;
      } else {
        const evalResult = evaluatePredictiveLevelBreak(candleCache, sym);
        if (evalResult.fire) message = evalResult.message;
      }
    }

    if (!message) continue;
    const result = await triggerAlert(supabase, userId, alert, message, hasPush);
    if (result.triggered) {
      triggered += 1;
      if (result.pushed) pushed += 1;
    }
  }

  return { triggered, pushed };
}
