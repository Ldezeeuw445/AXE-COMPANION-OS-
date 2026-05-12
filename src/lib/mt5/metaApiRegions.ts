/**
 * MetaApi regions — the cloud terminal physically lives in one of these.
 *
 * Picking the right region matters for two reasons:
 *   1. Latency. A trader in Singapore on a london-hosted terminal sees
 *      noticeable lag in tick stream + order placement.
 *   2. Coverage. Some broker servers are not registered in every region —
 *      "E_SRV_NOT_FOUND" can mean the server name is wrong, OR the server
 *      is registered in london but the user tried to provision in
 *      new-york (or vice versa).
 *
 * The active list mirrors MetaApi's three primary cloud regions. Adding
 * more (e.g. `frankfurt`, `mumbai`) only requires extending this map —
 * the URL builders pick them up automatically.
 */

export type MetaApiRegion = "london" | "new-york" | "singapore";

export const META_API_REGIONS: MetaApiRegion[] = ["london", "new-york", "singapore"];

type RegionInfo = {
  region: MetaApiRegion;
  label: string;
  description: string;
  /** ISO country prefix codes that should default to this region. */
  countries: string[];
  /** Region-specific REST hosts. Provisioning is region-agnostic. */
  clientApiHost: string;
  marketDataHost: string;
};

const REGIONS: Record<MetaApiRegion, RegionInfo> = {
  london: {
    region: "london",
    label: "London",
    description: "Europe, Africa, Middle East",
    countries: [
      "GB",
      "IE",
      "NL",
      "BE",
      "DE",
      "FR",
      "ES",
      "PT",
      "IT",
      "CH",
      "AT",
      "SE",
      "NO",
      "DK",
      "FI",
      "PL",
      "CZ",
      "RO",
      "HU",
      "GR",
      "TR",
      "RU",
      "UA",
      "IL",
      "AE",
      "SA",
      "EG",
      "ZA",
    ],
    clientApiHost:
      "https://mt-client-api-vzsrmwxzqcwfarnn.london.agiliumtrade.ai",
    marketDataHost:
      "https://mt-market-data-client-api-v1.london.agiliumtrade.ai",
  },
  "new-york": {
    region: "new-york",
    label: "New York",
    description: "Americas — US, Canada, Latin America",
    countries: ["US", "CA", "MX", "BR", "AR", "CL", "CO", "PE"],
    clientApiHost:
      "https://mt-client-api-vzsrmwxzqcwfarnn.new-york.agiliumtrade.ai",
    marketDataHost:
      "https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai",
  },
  singapore: {
    region: "singapore",
    label: "Singapore",
    description: "Asia-Pacific — SG, HK, JP, AU, IN",
    countries: ["SG", "HK", "JP", "KR", "CN", "TW", "AU", "NZ", "IN", "ID", "TH", "VN", "MY", "PH"],
    clientApiHost:
      "https://mt-client-api-vzsrmwxzqcwfarnn.singapore.agiliumtrade.ai",
    marketDataHost:
      "https://mt-market-data-client-api-v1.singapore.agiliumtrade.ai",
  },
};

export function getRegionInfo(region: string | null | undefined): RegionInfo {
  if (!region) return REGIONS.london;
  const key = region.trim().toLowerCase() as MetaApiRegion;
  return REGIONS[key] ?? REGIONS.london;
}

export function listRegions(): RegionInfo[] {
  return META_API_REGIONS.map((r) => REGIONS[r]);
}

/**
 * Pick the best default region from an ISO country code (e.g. Vercel's
 * x-vercel-ip-country header). Falls back to london when unknown.
 */
export function defaultRegionForCountry(country: string | null | undefined): MetaApiRegion {
  if (!country) return "london";
  const cc = country.trim().toUpperCase();
  for (const region of META_API_REGIONS) {
    if (REGIONS[region].countries.includes(cc)) return region;
  }
  return "london";
}

export function clientApiHostForRegion(region: string | null | undefined): string {
  return getRegionInfo(region).clientApiHost;
}

export function marketDataHostForRegion(region: string | null | undefined): string {
  return getRegionInfo(region).marketDataHost;
}
