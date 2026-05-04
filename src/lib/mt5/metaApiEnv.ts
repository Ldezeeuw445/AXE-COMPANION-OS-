/** Server-only MetaApi configuration (never import from client components). */

const DEFAULT_PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const DEFAULT_CLIENT_LONDON =
  "https://mt-client-api-vzsrmwxzqcwfarnn.london.agiliumtrade.ai";
/** Historical candles / market data REST (region-specific; London default). */
const DEFAULT_MARKET_DATA_LONDON = "https://mt-market-data-client-api-v1.london.agiliumtrade.ai";

export function getMetaApiToken(): string | null {
  const t =
    process.env.METAAPI_TOKEN ??
    process.env.AXE_METAAPI_TOKEN ??
    process.env.AXE_MT5_METAAPI_TOKEN ??
    "";
  return t.trim() || null;
}

export function getMetaApiProvisioningBaseUrl(): string {
  return (process.env.METAAPI_PROVISIONING_URL ?? DEFAULT_PROVISIONING).replace(/\/$/, "");
}

export function getMetaApiClientBaseUrl(): string {
  return (process.env.METAAPI_CLIENT_API_URL ?? DEFAULT_CLIENT_LONDON).replace(/\/$/, "");
}

export function getMetaApiMarketDataBaseUrl(): string {
  return (process.env.METAAPI_MARKET_DATA_URL ?? DEFAULT_MARKET_DATA_LONDON).replace(/\/$/, "");
}

export function getMetaApiDefaultRegion(): string {
  return (process.env.METAAPI_DEFAULT_REGION ?? "london").trim() || "london";
}
