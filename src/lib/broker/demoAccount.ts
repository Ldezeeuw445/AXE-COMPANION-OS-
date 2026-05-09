import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrokerAccountRow } from "@/lib/broker/loadAccountsPageData";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";

export const DEMO_CONNECTION_METHOD = "demo_paper";
export const DEMO_EXTERNAL_ID = "axe-demo-paper";

const DEMO_BALANCE = 100_000;

type DemoAccountRow = Pick<
  BrokerAccountRow,
  | "id"
  | "label"
  | "provider"
  | "status"
  | "mt5_login"
  | "mt5_server"
  | "created_at"
  | "connection_method"
  | "external_connection_id"
  | "provider_status"
  | "last_sync_at"
  | "masked_login"
  | "metadata"
>;

export function isDemoAccount(
  account: { connection_method?: string | null; provider?: string | null } | null | undefined,
) {
  return account?.connection_method === DEMO_CONNECTION_METHOD || account?.provider === "demo";
}

export async function ensureDemoAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<DemoAccountRow | null> {
  const { data: existing, error: existingErr } = await supabase
    .from("user_broker_accounts")
    .select(
      "id,label,provider,status,mt5_login,mt5_server,created_at,connection_method,external_connection_id,provider_status,last_sync_at,masked_login,metadata",
    )
    .eq("user_id", userId)
    .eq("connection_method", DEMO_CONNECTION_METHOD)
    .maybeSingle();

  if (existingErr) {
    // Surface DB issues to Vercel logs — silent failure is what masked the
    // CHECK-constraint regression that hid demo accounts from every user.
    console.warn("[demoAccount] lookup failed", existingErr.message ?? existingErr);
    return null;
  }
  if (existing) return existing as DemoAccountRow;

  const now = new Date().toISOString();
  const { data: created, error: createErr } = await supabase
    .from("user_broker_accounts")
    .insert({
      user_id: userId,
      provider: "demo",
      label: "AXE Demo Account",
      status: "active",
      connection_method: DEMO_CONNECTION_METHOD,
      external_connection_id: DEMO_EXTERNAL_ID,
      provider_status: "connected",
      mt5_login: null,
      mt5_server: "AXE Paper",
      masked_login: "DEMO",
      last_sync_at: now,
      metadata: {
        demo: true,
        balance: DEMO_BALANCE,
        equity: DEMO_BALANCE,
        currency: "USD",
        description: "Virtual paper trading account. No broker execution.",
      },
    })
    .select(
      "id,label,provider,status,mt5_login,mt5_server,created_at,connection_method,external_connection_id,provider_status,last_sync_at,masked_login,metadata",
    )
    .single();

  if (createErr) {
    console.warn("[demoAccount] insert failed", {
      code: createErr.code,
      message: createErr.message,
      details: createErr.details,
      hint: createErr.hint,
    });
    return null;
  }
  return created as DemoAccountRow;
}

export async function ensureActiveDemoWhenEmpty(
  supabase: SupabaseClient,
  userId: string,
  activeAccountId: string | null | undefined,
  accounts: BrokerAccountRow[],
): Promise<{ accounts: BrokerAccountRow[]; activeAccountId: string | null }> {
  const demo = await ensureDemoAccount(supabase, userId);
  const nextAccounts = demo && !accounts.some((a) => a.id === demo.id) ? [demo, ...accounts] : accounts;
  const nextActive = activeAccountId ?? demo?.id ?? null;

  if (!activeAccountId && demo?.id) {
    await supabase.from("user_workspace_preferences").upsert(
      {
        user_id: userId,
        active_account_id: demo.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  return { accounts: nextAccounts, activeAccountId: nextActive };
}

export function generateDemoCandles(symbol: string, timeframeKey: string, count = 500): MetaApiCandle[] {
  const now = Date.now();
  const stepMs = timeframeMs(timeframeKey);
  const base = demoBasePrice(symbol);
  const seed = symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const candles: MetaApiCandle[] = [];
  let close = base;

  for (let index = count - 1; index >= 0; index -= 1) {
    const t = now - index * stepMs;
    const wave = Math.sin((count - index + seed) / 13) * base * 0.0018;
    const drift = Math.cos((count - index + seed) / 31) * base * 0.0009;
    const open = close;
    close = Math.max(base * 0.65, open + wave + drift);
    const spread = Math.max(base * 0.0004, Math.abs(close - open) * 0.45);
    const high = Math.max(open, close) + spread;
    const low = Math.min(open, close) - spread;

    candles.push({
      time: new Date(t).toISOString(),
      open: roundPrice(open, base),
      high: roundPrice(high, base),
      low: roundPrice(low, base),
      close: roundPrice(close, base),
      tickVolume: 80 + ((count - index + seed) % 180),
      volume: 80 + ((count - index + seed) % 180),
    });
  }

  return candles;
}

function timeframeMs(tf: string): number {
  switch (tf.toLowerCase()) {
    case "m1":
      return 60_000;
    case "m5":
      return 5 * 60_000;
    case "m15":
      return 15 * 60_000;
    case "m30":
      return 30 * 60_000;
    case "h4":
      return 4 * 60 * 60_000;
    case "d1":
      return 24 * 60 * 60_000;
    case "h1":
    default:
      return 60 * 60_000;
  }
}

function demoBasePrice(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("XAU")) return 2350;
  if (s.includes("BTC")) return 68_000;
  if (s.includes("ETH")) return 3200;
  if (s.includes("JPY")) return 155;
  if (s.includes("EUR") || s.includes("GBP")) return 1.08;
  return 100;
}

function roundPrice(value: number, base: number): number {
  const digits = base >= 1000 ? 2 : base >= 100 ? 3 : 5;
  return Number(value.toFixed(digits));
}
