import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveMetaApiCloudAccount } from "@/lib/mt5/activeCloudAccount";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import { clientGetPositions } from "@/lib/mt5/metaApiClient";

export type OpenPositionRow = {
  id: string;
  symbol: string;
  side: string;
  volume: number;
  openPrice: number | null;
  currentPrice: number | null;
  profit: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  openTime: string | null;
};

export type PositionsPageData = {
  positions: OpenPositionRow[];
  providerStatus: string | null;
  error: string | null;
  hint: string | null;
};

function mapSide(t: string | undefined): string {
  const u = (t ?? "").toUpperCase();
  if (u.includes("BUY")) return "buy";
  if (u.includes("SELL")) return "sell";
  return (t ?? "").toLowerCase();
}

export async function loadPositionsPageData(): Promise<PositionsPageData> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { positions: [], providerStatus: null, error: "Supabase is not configured.", hint: null };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { positions: [], providerStatus: null, error: "Not signed in.", hint: null };
  }

  if (!getMetaApiToken()) {
    return {
      positions: [],
      providerStatus: "provider_not_configured",
      error: null,
      hint: "AXE MT5 Cloud is not configured on the server yet, so live positions cannot load.",
    };
  }

  const cloud = await getActiveMetaApiCloudAccount(supabase, user.id);
  if (!cloud) {
    return {
      positions: [],
      providerStatus: null,
      error: null,
      hint: "Set an active AXE MT5 Cloud account on Accounts, then Sync. Positions load from your MT5 terminal through AXE.",
    };
  }

  try {
    const raw = (await clientGetPositions(
      cloud.metaApiAccountId,
      true,
      cloud.metaApiRegion,
    )) as Record<string, unknown>[];
    const positions: OpenPositionRow[] = raw.map((p, i) => {
      const id = String(p.id ?? p.positionId ?? i);
      const symbol = String(p.symbol ?? "");
      const side = mapSide(typeof p.type === "string" ? (p.type as string) : undefined);
      return {
        id,
        symbol,
        side,
        volume: Number(p.volume ?? 0) || 0,
        openPrice: p.openPrice != null ? Number(p.openPrice) : null,
        currentPrice: p.currentPrice != null ? Number(p.currentPrice) : p.price != null ? Number(p.price) : null,
        profit: p.profit != null ? Number(p.profit) : p.unrealizedProfit != null ? Number(p.unrealizedProfit) : null,
        stopLoss: p.stopLoss != null ? Number(p.stopLoss) : null,
        takeProfit: p.takeProfit != null ? Number(p.takeProfit) : null,
        openTime: (p.time as string) ?? (p.updateTime as string) ?? null,
      };
    });

    return {
      positions,
      providerStatus: "connected",
      error: null,
      hint: positions.length === 0 ? "No open positions on this account right now." : null,
    };
  } catch {
    return {
      positions: [],
      providerStatus: "failed",
      error: null,
      hint: "Could not load positions through AXE MT5 Cloud. Try Test/Sync on Accounts, or check server logs.",
    };
  }
}
