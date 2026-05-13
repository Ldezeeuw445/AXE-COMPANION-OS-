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
  const volatility = demoVolatility(symbol, timeframeKey);
  let close = base * (1 + (seed % 17 - 8) * volatility * 0.35);
  let drift = ((seed % 11) - 5) * volatility * 0.035;

  for (let index = count - 1; index >= 0; index -= 1) {
    const ordinal = count - index;
    const t = now - index * stepMs;
    const shock = seededNoise(seed + ordinal * 17) * volatility;
    const regimeShift = seededNoise(seed + Math.floor(ordinal / 55) * 97) * volatility * 0.45;
    const sessionImpulse = Math.sin((ordinal + seed) / 23) * volatility * 0.28;
    drift = clamp(drift * 0.94 + regimeShift * 0.06, -volatility * 0.6, volatility * 0.6);
    const open = close;
    const movePct = clamp(drift + shock + sessionImpulse, -volatility * 2.8, volatility * 2.8);
    close = clamp(open * (1 + movePct), base * 0.55, base * 1.65);
    const body = Math.abs(close - open);
    const wickScale = base * volatility * (0.35 + Math.abs(seededNoise(seed + ordinal * 31)));
    const upperWick = Math.max(wickScale * 0.35, body * (0.22 + Math.abs(seededNoise(seed + ordinal * 7)) * 0.65));
    const lowerWick = Math.max(wickScale * 0.35, body * (0.22 + Math.abs(seededNoise(seed + ordinal * 13)) * 0.65));
    const spread = Math.max(base * volatility * 0.06, body * 0.12);
    const high = Math.max(open, close) + spread;
    const low = Math.min(open, close) - spread;
    const tickVolume = Math.round(
      70 +
        Math.min(520, (body / Math.max(base * volatility, 0.000001)) * 85) +
        Math.abs(seededNoise(seed + ordinal * 19)) * 160,
    );

    candles.push({
      time: new Date(t).toISOString(),
      open: roundPrice(open, base),
      high: roundPrice(high + upperWick, base),
      low: roundPrice(low - lowerWick, base),
      close: roundPrice(close, base),
      tickVolume,
      volume: tickVolume,
    });
  }

  return candles;
}

function seededNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function demoVolatility(symbol: string, timeframeKey: string): number {
  const s = symbol.toUpperCase();
  const instrument =
    s.includes("BTC") || s.includes("ETH")
      ? 0.0048
      : s.includes("XAU")
        ? 0.0024
        : s.includes("JPY")
          ? 0.00125
          : s.includes("EUR") || s.includes("GBP")
            ? 0.00075
            : 0.0012;

  switch (timeframeKey.toLowerCase()) {
    case "m1":
      return instrument * 0.42;
    case "m5":
      return instrument * 0.62;
    case "m15":
      return instrument * 0.9;
    case "m30":
      return instrument * 1.2;
    case "h4":
      return instrument * 2.3;
    case "d1":
      return instrument * 4.2;
    case "h1":
    default:
      return instrument * 1.65;
  }
}

function roundPrice(value: number, base: number): number {
  const digits = base >= 1000 ? 2 : base >= 100 ? 3 : 5;
  return Number(value.toFixed(digits));
}
