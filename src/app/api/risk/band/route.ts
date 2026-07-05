import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveMetaApiCloudAccount } from "@/lib/mt5/activeCloudAccount";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import { clientGetAccountInformation, clientGetOrders, clientGetPositions } from "@/lib/mt5/metaApiClient";
import {
  computeAccountRiskBand,
  pointValuePerLot,
  type RiskBandPosition,
} from "@/lib/risk/accountRiskBand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapSide(t: string | undefined): string {
  const u = (t ?? "").toUpperCase();
  if (u.includes("BUY")) return "buy";
  if (u.includes("SELL")) return "sell";
  return (t ?? "").toLowerCase();
}

type ClientDemoPosition = {
  id: string;
  symbol: string;
  side: string;
  volume: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  livePrice?: number | null;
};

type ClientOpenPosition = ClientDemoPosition & {
  profit?: number | null;
};

type ClientPendingOrder = {
  id: string;
  symbol: string;
  side: string;
  volume: number;
  openPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
};

function demoUnrealized(p: ClientDemoPosition): number {
  const live = p.livePrice ?? p.entryPrice;
  const direction = mapSide(p.side) === "buy" ? 1 : -1;
  return (live - p.entryPrice) * direction * pointValuePerLot(p.symbol) * p.volume;
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let openPositions: ClientOpenPosition[] = [];
  let demoPositions: ClientDemoPosition[] = [];
  let pendingOrders: ClientPendingOrder[] = [];
  try {
    const body = (await req.json()) as {
      openPositions?: ClientOpenPosition[];
      demoPositions?: ClientDemoPosition[];
      pendingOrders?: ClientPendingOrder[];
    };
    openPositions = Array.isArray(body.openPositions) ? body.openPositions : [];
    demoPositions = Array.isArray(body.demoPositions) ? body.demoPositions : [];
    pendingOrders = Array.isArray(body.pendingOrders) ? body.pendingOrders : [];
  } catch {
    openPositions = [];
    demoPositions = [];
    pendingOrders = [];
  }

  const { data: prefs } = await supabase
    .from("user_workspace_preferences")
    .select("max_account_risk_percent")
    .eq("user_id", user.id)
    .maybeSingle();

  const maxRiskPercent = Number(prefs?.max_account_risk_percent ?? 5);

  const positionsByKey = new Map<string, RiskBandPosition>();
  const putPosition = (p: RiskBandPosition, source: "client" | "broker" = "client") => {
    if (!p.id || !p.symbol) return;
    if (!Number.isFinite(p.entryPrice) || p.entryPrice <= 0) return;
    if (!Number.isFinite(p.volume) || p.volume <= 0) return;
    const key = `${p.symbol.toUpperCase()}:${p.id}`;
    if (source === "client" && positionsByKey.has(key)) return;
    positionsByKey.set(key, p);
  };

  for (const p of openPositions) {
    putPosition({
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      volume: p.volume,
      entryPrice: p.entryPrice,
      currentPrice: p.livePrice ?? p.entryPrice,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      unrealizedPnl:
        p.profit != null && Number.isFinite(Number(p.profit))
          ? Number(p.profit)
          : demoUnrealized(p),
    });
  }

  for (const p of demoPositions) {
    putPosition({
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      volume: p.volume,
      entryPrice: p.entryPrice,
      currentPrice: p.livePrice ?? p.entryPrice,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      unrealizedPnl: demoUnrealized(p),
    });
  }

  for (const order of pendingOrders) {
    if (!Number.isFinite(order.openPrice) || !Number.isFinite(order.volume)) continue;
    putPosition({
      id: `pending:${order.id}`,
      symbol: order.symbol,
      side: order.side,
      volume: order.volume,
      entryPrice: order.openPrice,
      currentPrice: order.openPrice,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      unrealizedPnl: 0,
    });
  }

  let equity = 100_000;
  let balance: number | null = equity;
  let currency: string | null = "USD";

  const token = getMetaApiToken();
  const cloud = await getActiveMetaApiCloudAccount(supabase, user.id);
  if (token && cloud?.metaapi_account_id) {
    try {
      const [accountInfo, mt5Positions, mt5Orders] = await Promise.all([
        clientGetAccountInformation(token, cloud.metaapi_account_id),
        clientGetPositions(token, cloud.metaapi_account_id),
        clientGetOrders(cloud.metaapi_account_id, false, cloud.metaApiRegion ?? null),
      ]);

      if (accountInfo?.equity != null) equity = Number(accountInfo.equity);
      if (accountInfo?.balance != null) balance = Number(accountInfo.balance);
      currency = (accountInfo?.currency as string | undefined) ?? currency;

      for (const row of mt5Positions ?? []) {
        const entry = Number(row.openPrice ?? row.currentPrice ?? 0);
        putPosition({
          id: String(row.id ?? row.positionId ?? `${row.symbol}-${entry}`),
          symbol: String(row.symbol ?? ""),
          side: mapSide(row.type as string | undefined),
          volume: Number(row.volume ?? 0),
          entryPrice: entry,
          currentPrice: row.currentPrice != null ? Number(row.currentPrice) : null,
          stopLoss: row.stopLoss != null ? Number(row.stopLoss) : null,
          takeProfit: row.takeProfit != null ? Number(row.takeProfit) : null,
          unrealizedPnl: Number(row.profit ?? row.unrealizedProfit ?? 0),
        }, "broker");
      }

      for (const row of mt5Orders ?? []) {
        const order = row as Record<string, unknown>;
        const entry = Number(order.openPrice ?? order.currentPrice ?? 0);
        const volume = Number(order.volume ?? 0);
        if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(volume) || volume <= 0) continue;
        putPosition({
          id: String(order.id ?? order.orderId ?? `order-${order.symbol}-${entry}`),
          symbol: String(order.symbol ?? ""),
          side: mapSide(order.type as string | undefined),
          volume,
          entryPrice: entry,
          currentPrice: entry,
          stopLoss: order.stopLoss != null ? Number(order.stopLoss) : null,
          takeProfit: order.takeProfit != null ? Number(order.takeProfit) : null,
          unrealizedPnl: 0,
        });
      }
    } catch {
      /* keep demo-only book if MT5 unavailable */
    }
  }

  const positions = Array.from(positionsByKey.values());
  const band = computeAccountRiskBand(positions, {
    equity,
    balance,
    currency,
    maxRiskPercent,
  });

  return Response.json({ band, positionCount: positions.length });
}
