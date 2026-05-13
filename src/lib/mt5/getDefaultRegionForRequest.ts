import "server-only";

import { headers } from "next/headers";
import {
  defaultRegionForCountry,
  type MetaApiRegion,
} from "@/lib/mt5/metaApiRegions";
import { getMetaApiDefaultRegion } from "@/lib/mt5/metaApiEnv";

/**
 * Best-effort guess of which MetaApi region this user is closest to.
 *
 * Reads the country ISO code from Vercel's geo headers (or any reverse
 * proxy that mirrors them). Falls back to the env-driven default
 * (METAAPI_DEFAULT_REGION, defaults to "london") when no geo header is
 * present — i.e. local dev or platforms that don't expose geo.
 *
 * The user can still override the picked region in the connect form;
 * this only sets the initial value so the default already feels right
 * for traders outside of Europe.
 */
export async function getDefaultRegionForRequest(): Promise<MetaApiRegion> {
  try {
    const hdrs = await headers();
    const country =
      hdrs.get("x-vercel-ip-country") ||
      hdrs.get("cf-ipcountry") ||
      hdrs.get("x-country") ||
      null;
    if (country) return defaultRegionForCountry(country);
  } catch {
    // headers() throws outside a request scope — fall through.
  }

  const env = getMetaApiDefaultRegion().toLowerCase();
  if (env === "new-york" || env === "singapore") return env;
  return "london";
}
