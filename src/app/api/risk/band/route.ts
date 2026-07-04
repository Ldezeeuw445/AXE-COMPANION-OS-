import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveMetaApiCloudAccount } from "@/lib/mt5/activeCloudAccount";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import { clientGetAccountInformation, clientGetPositions } from "@/lib/mt5/metaApiClient";
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

  let demoPositions: ClientDemoPosition[] = [];
  let pendingOrders: ClientPendingOrder[] = [];
  try {
    const body = (await req.json()) as {
      demoPositions?: ClientDemoPosition[];
      pendingOrders?: ClientPendingOrder[];
    };
    demoPositions = Array.isArray(body.demoPositions) ? body.demoPositions : [];
    pendingOrders = Array.isArray(body.pendingOrders) ? body.pendingOrders : [];
  } catch {
    demoPositions = [];
    pendingOrders = [];
  }

  const { data: prefs } = await supabase
    .from("user_workspace_preferences")
    .select("max_account_risk_percent")
    .eq("user_id", user.id)
    .maybeSingle();

  const maxRiskPercent = Number(prefs?.max_account_risk_percent ?? 5);

  const positions: RiskBandPosition[] = demoPositions.map((p) => ({
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    volume: p.volume,
    entryPrice: p.entryPrice,
    currentPrice: p.livePrice ?? p.entryPrice,
    stopLoss: p.stopLoss,
    takeProfit: p.takeProfit,
    unrealizedPnl: demoUnrealized(p),
  }));

  for (const order of pendingOrders) {
    if (!Number.isFinite(order.openPrice) || !Number.isFinite(order.volume)) continue;
    positions.push({
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
      const [accountInfo, mt5Positions] = await Promise.all([
        clientGetAccountInformation(token, cloud.metaapi_account_id),
        clientGetPositions(token, cloud.metaapi_account_id),
      ]);

      if (accountInfo?.equity != null) equity = Number(accountInfo.equity);
      if (accountInfo?.balance != null) balance = Number(accountInfo.balance);
      currency = (accountInfo?.currency as string | undefined) ?? currency;

      for (const row of mt5Positions ?? []) {
        const entry = Number(row.openPrice ?? row.currentPrice ?? 0);
        positions.push({
          id: String(row.id ?? row.positionId ?? `${row.symbol}-${entry}`),
          symbol: String(row.symbol ?? ""),
          side: mapSide(row.type as string | undefined),
          volume: Number(row.volume ?? 0),
          entryPrice: entry,
          currentPrice: row.currentPrice != null ? Number(row.currentPrice) : null,
          stopLoss: row.stopLoss != null ? Number(row.stopLoss) : null,
          takeProfit: row.takeProfit != null ? Number(row.takeProfit) : null,
          unrealizedPnl: Number(row.profit ?? row.unrealizedProfit ?? 0),
        });
      }
    } catch {
      /* keep demo-only book if MT5 unavailable */
    }
  }

  const band = computeAccountRiskBand(positions, {
    equity,
    balance,
    currency,
    maxRiskPercent,
  });

  return Response.json({ band, positionCount: positions.length });
}
