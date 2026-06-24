import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlpacaEnvConfig } from "@/lib/alpaca/env";
import { getAlpacaPaperConfig } from "@/lib/alpaca/env";
import { loadStoredBrokerCredentials } from "@/lib/broker/hub/adapters/secretHelpers";

const DEFAULT_PAPER_TRADING = "https://paper-api.alpaca.markets";
const DEFAULT_LIVE_TRADING = "https://api.alpaca.markets";
const DEFAULT_DATA = "https://data.alpaca.markets";

type AlpacaAccountRow = {
  id: string;
  user_id: string;
  connection_method: string | null;
  metadata: Record<string, unknown> | null;
};

export function isUserOwnedAlpacaMethod(connectionMethod: string | null | undefined): boolean {
  return connectionMethod === "alpaca_paper_byo" || connectionMethod === "alpaca_live";
}

export function isAnyAlpacaMethod(connectionMethod: string | null | undefined): boolean {
  return (
    connectionMethod === "cloud_alpaca" ||
    connectionMethod === "alpaca_paper_byo" ||
    connectionMethod === "alpaca_live"
  );
}

export function buildAlpacaConfig(input: {
  keyId: string;
  secretKey: string;
  environment: "paper" | "live";
  tradingBaseUrl?: string | null;
  dataBaseUrl?: string | null;
}): AlpacaEnvConfig {
  return {
    keyId: input.keyId,
    secretKey: input.secretKey,
    tradingBaseUrl:
      input.tradingBaseUrl?.trim() ||
      (input.environment === "live" ? DEFAULT_LIVE_TRADING : DEFAULT_PAPER_TRADING),
    dataBaseUrl: input.dataBaseUrl?.trim() || DEFAULT_DATA,
    paper: input.environment !== "live",
  };
}

function stringMeta(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function loadAlpacaAccountConfig(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{ account: AlpacaAccountRow; config: AlpacaEnvConfig } | null> {
  const { data: account, error } = await supabase
    .from("user_broker_accounts")
    .select("id,user_id,connection_method,metadata")
    .eq("id", accountId)
    .maybeSingle<AlpacaAccountRow>();

  if (error) throw new Error(error.message);
  if (!account || !isAnyAlpacaMethod(account.connection_method)) return null;

  if (account.connection_method === "cloud_alpaca") {
    const config = getAlpacaPaperConfig();
    if (!config) return null;
    return { account, config };
  }

  const credentials = await loadStoredBrokerCredentials(supabase, accountId);
  if (!credentials?.apiKey || !credentials?.apiSecret) return null;

  const metadata = account.metadata ?? {};
  const environment = account.connection_method === "alpaca_live" ? "live" : "paper";
  const config = buildAlpacaConfig({
    keyId: credentials.apiKey,
    secretKey: credentials.apiSecret,
    environment,
    tradingBaseUrl:
      stringMeta(metadata, "alpacaTradingBaseUrl") ??
      stringMeta(metadata, "tradingBaseUrl") ??
      stringMeta(metadata, "baseUrl"),
    dataBaseUrl: stringMeta(metadata, "alpacaDataBaseUrl") ?? stringMeta(metadata, "dataBaseUrl"),
  });

  return { account, config };
}
