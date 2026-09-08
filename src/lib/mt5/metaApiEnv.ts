/** Server-only MetaApi configuration (never import from client components). */

import { firstNonEmptyEnv } from "@/lib/envFallback";
import {
  clientApiHostForRegion,
  marketDataHostForRegion,
  type MetaApiRegion,
} from "@/lib/mt5/metaApiRegions";

const DEFAULT_PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

/**
 * The MetaApi token, under any of the names it has been deployed with.
 *
 * METAAPI_KEY is included because it is the name used in at least one AXE
 * environment. Every MT5 path is gated on this returning non-null, and it fails
 * silently when it does not — a host that spells the variable differently has
 * MT5 switched off with no error anywhere, which is consistent with
 * mt5_positions never having held a row.
 */
export function getMetaApiToken(): string | null {
  return firstNonEmptyEnv(
    "METAAPI_TOKEN",
    "AXE_METAAPI_TOKEN",
    "AXE_MT5_METAAPI_TOKEN",
    "METAAPI_KEY",
  );
}

export function getMetaApiProvisioningBaseUrl(): string {
  return (process.env.METAAPI_PROVISIONING_URL ?? DEFAULT_PROVISIONING).replace(/\/$/, "");
}

/**
 * Region-aware client API base URL. Pass the account's stored region
 * (`metadata.metaapiRegion`) so we hit the host where the account actually
 * lives. Falls back to the env override or london when unknown.
 *
 * When `region` is omitted we still honor METAAPI_CLIENT_API_URL for legacy
 * single-region deployments — but new code should always pass the region.
 */
export function getMetaApiClientBaseUrl(region?: MetaApiRegion | string | null): string {
  if (region) return clientApiHostForRegion(region).replace(/\/$/, "");
  const override = process.env.METAAPI_CLIENT_API_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  return clientApiHostForRegion("london").replace(/\/$/, "");
}

export function getMetaApiMarketDataBaseUrl(
  region?: MetaApiRegion | string | null,
): string {
  if (region) return marketDataHostForRegion(region).replace(/\/$/, "");
  const override = process.env.METAAPI_MARKET_DATA_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  return marketDataHostForRegion("london").replace(/\/$/, "");
}

export function getMetaApiDefaultRegion(): string {
  return (process.env.METAAPI_DEFAULT_REGION ?? "london").trim() || "london";
}
