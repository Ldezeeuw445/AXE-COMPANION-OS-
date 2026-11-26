import "server-only";

import { listWatchlistItems } from "@/app/(app)/settings/actions";
import { applyAccountIdReadFilter } from "@/lib/account/accountScopedRows";
import { readAccountSnapshot, reconcileAccountLedger } from "@/lib/account/reconcileAccountLedger";
import { loadPositionsPageData } from "@/lib/broker/loadPositionsPageData";
import { getDemoQuotePrice, isDemoAccount } from "@/lib/broker/demoAccount";
import { cleanDisplaySymbol } from "@/lib/broker/symbolResolution";
import { parseBriefSections, sectionDisplayLabel } from "@/lib/briefing/briefBodyFormat";
import { netPnl } from "@/lib/journal/tradePnl";
import { buildMarketContext } from "@/lib/market/marketContextService";
import { buildAccountProfile, type AccountKind } from "@/lib/risk/accountProfile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadAdaptiveSuggestions } from "@/lib/adaptive/server";
import { getActiveBrief } from "@/services/axeDailyBriefingService";
import { sideKind, sideLabel } from "@/lib/home/format";
import {
  emptyHomePageData,
  kindLabel,
  type HomeAccount,
  type HomeAlert,
  type HomeBriefItem,
  type HomeJournalNote,
  type HomePageData,
  type HomePosition,
  type HomeQuote,
  type HomeStep,
  type HomeTrade,
} from "@/lib/home/homeTypes";

async function settled<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function extraLine(p: {
  stopLoss: number | null;
  takeProfit: number | null;
  pending: boolean;
}): string | null {
  const bits: string[] = [];
  if (p.stopLoss != null) bits.push(`SL ${p.stopLoss}`);
  if (p.takeProfit != null) bits.push(`TP ${p.takeProfit}`);
  if (p.pending) bits.push("Not filled");
  return bits.length ? bits.join(" · ") : null;
}

function briefItemsFromBody(body: string | null | undefined): HomeBriefItem[] {
  if (!body?.trim()) return [];
  const sections = parseBriefSections(body);
  const pick = (id: string, fallbackTone: HomeBriefItem["tone"]): HomeBriefItem | null => {
    const section = sections.find((s) => s.id === id);
    const para = section?.paragraphs.find((p) => p.trim().length > 12);
    if (!section || !para) return null;
    const k = sectionDisplayLabel(section.id) ?? id;
    return { tone: fallbackTone, k, v: para };
  };
  const items = [
    pick("market_outlook", "ok"),
    pick("action_items", "action"),
    pick("watch", "warn") ?? pick("news", "warn"),
  ].filter((x): x is HomeBriefItem => Boolean(x));
  if (items.length > 0) return items.slice(0, 3);
  const greeting = sections.find((s) => s.id === "greeting")?.paragraphs ?? [];
  return greeting.slice(0, 3).map((v, i) => ({
    tone: i === 1 ? "action" : "ok",
    k: i === 0 ? "Brief" : i === 1 ? "Next" : "Note",
    v,
  }));
}

export async function loadHomePageData(): Promise<HomePageData> {
  const empty = emptyHomePageData();
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ...empty, loadError: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...empty, loadError: "Not signed in." };

  const userId = user.id;

  const [
    accsRes,
    prefsRes,
    tradesRes,
    journalRes,
    alertsRes,
    walletsRes,
    watchlist,
    positionsPage,
    adaptiveRows,
    briefRow,
  ] = await Promise.all([
    supabase
      .from("user_broker_accounts")
      .select(
        "id,label,provider,status,mt5_login,mt5_server,created_at,connection_method,provider_status,last_sync_at,metadata",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("user_workspace_preferences").select("active_account_id").eq("user_id", userId).maybeSingle(),
    supabase
      .from("broker_trades")
      .select("id,account_id,symbol,side,volume,close_time,pnl,fees")
      .eq("user_id", userId)
      .order("close_time", { ascending: false, nullsFirst: false })
      .limit(200),
    applyAccountIdReadFilter(
      supabase
        .from("user_journal_entries")
        .select("id,symbol,notes,rating,tags,created_at")
        .eq("user_id", userId),
      null,
    )
      .order("created_at", { ascending: false })
      .limit(16),
    applyAccountIdReadFilter(
      supabase
        .from("user_alerts")
        .select("id,symbol,type,condition,threshold,keyword,status,triggered_at,created_at,metadata")
        .eq("user_id", userId),
      null,
    )
      .order("created_at", { ascending: false })
      .limit(24),
    supabase
      .from("user_crypto_wallets")
      .select("id,provider,label,chain,address,notes,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    settled(listWatchlistItems(), []),
    settled(loadPositionsPageData(), {
      positions: [],
      pendingOrders: [],
      accountSummary: null,
      lastSyncAt: null,
      figuresFromCache: false,
      providerStatus: null,
      error: null,
      hint: null,
      brokerAccountId: null,
    }),
    settled(loadAdaptiveSuggestions(supabase, userId), []),
    settled(getActiveBrief(supabase, userId), null),
  ]);

  const accountRows = (accsRes.data ?? []) as Array<{
    id: string;
    label: string;
    mt5_server: string | null;
    connection_method: string | null;
    last_sync_at: string | null;
    metadata: Record<string, unknown> | null;
  }>;
  const activeAccountId = (prefsRes.data?.active_account_id as string | null | undefined) ?? null;

  const tradesByAccount = new Map<string, { pnl: number; fees: number }[]>();
  const trades: HomeTrade[] = [];
  const accountLabel = (id: string) => accountRows.find((a) => a.id === id)?.label ?? "Account";

  for (const row of tradesRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const accountId = String(r.account_id ?? "");
    const pnl = Number(r.pnl ?? 0) || 0;
    const fees = Number(r.fees ?? 0) || 0;
    trades.push({
      id: String(r.id),
      accountId,
      accountLabel: accountLabel(accountId),
      symbol: String(r.symbol ?? ""),
      side: String(r.side ?? ""),
      pnl,
      fees,
      closeTime: (r.close_time as string | null) ?? null,
    });
    const list = tradesByAccount.get(accountId) ?? [];
    list.push({ pnl, fees });
    tradesByAccount.set(accountId, list);
  }

  const accounts: HomeAccount[] = accountRows.map((row) => {
    const profile = buildAccountProfile({
      label: row.label,
      mt5Server: row.mt5_server,
      metadata: row.metadata,
      connectionMethod: row.connection_method,
    });
    const snapshot = readAccountSnapshot(row.metadata);
    const ledger = reconcileAccountLedger({
      accountId: row.id,
      trades: tradesByAccount.get(row.id) ?? [],
      snapshot,
    });
    const kind: AccountKind = profile.kind;
    return {
      id: row.id,
      label: row.label || "Account",
      kind,
      kindLabel: kindLabel(kind),
      equity: snapshot.equity ?? ledger.equity,
      balance: snapshot.balance ?? ledger.balance,
      currency: snapshot.currency,
      realizedNet: ledger.tradeCount > 0 ? netPnl(ledger.grossPnl, ledger.fees) : null,
      isActive: row.id === activeAccountId,
      isProp: kind === "prop_evaluation" || kind === "prop_funded",
      firmName: profile.firm?.name ?? null,
      firmModel: profile.firm?.model ?? null,
      maxDailyLossPct: profile.maxDailyLossPct,
      maxTotalLossPct: profile.maxTotalLossPct,
      lastSyncAt: row.last_sync_at,
    };
  });

  const activeAccount = accountRows.find((a) => a.id === activeAccountId) ?? accountRows[0] ?? null;

  const watchSymbols = watchlist.map((i) => cleanDisplaySymbol(i.symbol) || i.symbol.trim().toUpperCase());
  const market = await settled(
    buildMarketContext({
      symbol: watchSymbols[0] || "XAUUSD",
      watchlist: watchSymbols,
      positionsSymbols: positionsPage.positions.map((p) => p.symbol),
      newsLimit: 8,
      calendarLimit: 10,
    }),
    null,
  );

  const snapshots =
    activeAccount && !isDemoAccount(activeAccount)
      ? (
          await supabase
            .from("chart_live_snapshots")
            .select("display_symbol,broker_symbol,last_price,updated_at")
            .eq("user_id", userId)
            .eq("account_id", activeAccount.id)
            .order("updated_at", { ascending: false })
            .limit(50)
        ).data
      : null;

  const snapBySym = new Map<string, number>();
  for (const s of snapshots ?? []) {
    const row = s as { display_symbol?: string; broker_symbol?: string; last_price?: number };
    const price = row.last_price != null ? Number(row.last_price) : NaN;
    if (!Number.isFinite(price)) continue;
    if (row.display_symbol) snapBySym.set(String(row.display_symbol).toUpperCase(), price);
    if (row.broker_symbol) snapBySym.set(String(row.broker_symbol).toUpperCase(), price);
  }

  const quotes: HomeQuote[] = watchlist.map((item) => {
    const display = cleanDisplaySymbol(item.symbol) || item.symbol.trim().toUpperCase();
    const demo = activeAccount && isDemoAccount(activeAccount) ? getDemoQuotePrice(display) : null;
    const price = demo?.price ?? snapBySym.get(display) ?? null;
    return {
      symbol: display,
      displaySymbol: display,
      price,
      changePercent: null,
      state: demo ? "live" : price != null ? "live" : "warming",
    };
  });

  const livePositions: HomePosition[] = positionsPage.positions.map((p) => ({
    id: p.id,
    accountId: positionsPage.brokerAccountId,
    symbol: p.symbol,
    side: sideKind(p.side),
    sideLabel: sideLabel(p.side),
    volume: p.volume,
    openPrice: p.openPrice,
    currentPrice: p.currentPrice,
    pnl: p.profit,
    stopLoss: p.stopLoss,
    takeProfit: p.takeProfit,
    extra: extraLine({ stopLoss: p.stopLoss, takeProfit: p.takeProfit, pending: false }),
    pending: false,
  }));

  const pending: HomePosition[] = positionsPage.pendingOrders.map((o) => ({
    id: o.id,
    accountId: positionsPage.brokerAccountId,
    symbol: o.symbol,
    side: "pend",
    sideLabel: sideLabel(o.type, o.type),
    volume: o.volume,
    openPrice: o.openPrice,
    currentPrice: o.currentPrice,
    pnl: null,
    stopLoss: o.stopLoss,
    takeProfit: o.takeProfit,
    extra: extraLine({ stopLoss: o.stopLoss, takeProfit: o.takeProfit, pending: true }),
    pending: true,
  }));

  const journal: HomeJournalNote[] = (journalRes.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const notes = String(r.notes ?? "").trim();
    const firstLine = notes.split("\n")[0]?.trim() || "Journal note";
    const tags = Array.isArray(r.tags) ? r.tags.map((t) => String(t)) : [];
    return {
      id: String(r.id),
      symbol: r.symbol ? String(r.symbol) : null,
      title: firstLine.slice(0, 80),
      body: notes.slice(firstLine.length).trim(),
      tag: tags[0] ?? (r.rating ? String(r.rating) : null),
      createdAt: String(r.created_at ?? ""),
    };
  });

  const alerts: HomeAlert[] = (alertsRes.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const meta = (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as Record<string, unknown>;
    const symbol = r.symbol ? String(r.symbol) : null;
    const type = String(r.type ?? "alert");
    const title =
      (typeof meta.smartTitle === "string" && meta.smartTitle) ||
      (symbol ? `${symbol} ${type}` : type.replace(/_/g, " "));
    const cond = r.condition ? String(r.condition) : "";
    const thr = r.threshold != null ? String(r.threshold) : "";
    const subtitle = [cond, thr, r.keyword ? String(r.keyword) : ""].filter(Boolean).join(" · ") || type;
    return {
      id: String(r.id),
      symbol,
      title,
      subtitle,
      createdAt: String(r.created_at ?? ""),
      triggeredAt: (r.triggered_at as string | null) ?? null,
      status: String(r.status ?? "active"),
    };
  });

  const wallets = (walletsRes.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      label: String(r.label ?? r.provider ?? "Wallet"),
      chain: String(r.chain ?? ""),
      address: String(r.address ?? ""),
      nativeAmount: null,
      nativeSymbol: null,
      usdEstimate: null,
    };
  });

  const news =
    market?.news.map((n) => ({
      id: n.id,
      title: n.title,
      source: n.source,
      url: n.url,
      publishedAt: n.publishedAt,
      sentiment: n.sentiment ?? null,
      symbols: (n.symbols ?? []).map((s) => s.toUpperCase()),
    })) ?? [];

  const events =
    market?.events.map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      impact: e.impact,
      currency: e.currency,
      country: e.country,
    })) ?? [];

  const macro =
    market?.macro?.points.map((p) => ({
      id: p.seriesId,
      label: p.label,
      value: p.value,
      units: p.units ?? null,
      observedAt: p.observedAt,
    })) ?? [];

  const brief = briefItemsFromBody(briefRow?.body ?? null);
  const pendingAdaptive = adaptiveRows.filter((row) => row.status === "pending").slice(0, 6);
  const steps: HomeStep[] = pendingAdaptive.map((row) => ({
    id: row.id,
    title: typeof row.payload.title === "string" ? row.payload.title : "AXE has a suggestion",
    subtitle:
      typeof row.payload.description === "string"
        ? row.payload.description
        : row.kind.replace(/_/g, " "),
  }));

  return {
    accounts,
    activeAccountId,
    quotes,
    positions: [...livePositions, ...pending],
    positionsAccountId: positionsPage.brokerAccountId,
    trades,
    journal,
    alerts,
    wallets,
    news,
    events,
    macro,
    brief,
    briefTitle: briefRow?.title ?? null,
    steps,
    figuresFromCache: positionsPage.figuresFromCache,
    loadError: accsRes.error?.message ?? positionsPage.error ?? null,
  };
}
