import "server-only";

type CoinGeckoPlan = "demo" | "pro";

function coingeckoPlan(): CoinGeckoPlan {
  const plan = process.env.COINGECKO_API_PLAN?.trim().toLowerCase();
  return plan === "pro" ? "pro" : "demo";
}

function coingeckoApiKey(): string | null {
  return (
    process.env.COINGECKO_API_KEY?.trim() ||
    process.env.COINGECKO_DEMO_API_KEY?.trim() ||
    null
  );
}

export function coingeckoConfigured(): boolean {
  return Boolean(coingeckoApiKey());
}

export async function coingeckoFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = coingeckoApiKey();
  const plan = coingeckoPlan();
  const base =
    plan === "pro" ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
  const headers = new Headers(init?.headers);
  if (key) {
    headers.set(plan === "pro" ? "x-cg-pro-api-key" : "x-cg-demo-api-key", key);
  }
  return fetch(`${base}${path}`, { ...init, headers });
}

export async function fetchNativeUsdPrices(): Promise<Record<string, number>> {
  const res = await coingeckoFetch(
    "/simple/price?ids=ethereum,matic-network,bitcoin&vs_currencies=usd",
    { next: { revalidate: 120 } },
  );
  if (!res.ok) {
    throw new Error(`CoinGecko price lookup failed (${res.status})`);
  }
  const json = (await res.json()) as Record<string, { usd?: number }>;
  return {
    ethereum: json.ethereum?.usd ?? 0,
    "matic-network": json["matic-network"]?.usd ?? 0,
    bitcoin: json.bitcoin?.usd ?? 0,
  };
}

/** USD prices for ERC-20 contracts on a CoinGecko asset platform. */
export async function fetchErc20TokenUsdPrices(
  platform: string,
  contractAddresses: string[],
): Promise<Record<string, number>> {
  if (contractAddresses.length === 0) return {};

  const unique = [...new Set(contractAddresses.map((a) => a.toLowerCase()))];
  const res = await coingeckoFetch(
    `/simple/token_price/${encodeURIComponent(platform)}?contract_addresses=${unique.join(",")}&vs_currencies=usd`,
    { next: { revalidate: 120 } },
  );
  if (!res.ok) {
    throw new Error(`CoinGecko token price lookup failed (${res.status})`);
  }

  const json = (await res.json()) as Record<string, { usd?: number }>;
  const out: Record<string, number> = {};
  for (const [addr, row] of Object.entries(json)) {
    if (row.usd != null && Number.isFinite(row.usd)) {
      out[addr.toLowerCase()] = row.usd;
    }
  }
  return out;
}
