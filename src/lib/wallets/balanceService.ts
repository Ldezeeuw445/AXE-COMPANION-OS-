import "server-only";

import type { WalletChain } from "@/types/wallets";
import type { WalletBalance } from "@/types/wallets";
import { chainSymbol } from "@/lib/wallets/walletCatalog";

const EVM_RPC: Record<Exclude<WalletChain, "bitcoin">, string> = {
  ethereum: "https://eth.llamarpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  polygon: "https://polygon-rpc.com",
};

const NATIVE_DECIMALS: Record<WalletChain, number> = {
  ethereum: 18,
  arbitrum: 18,
  polygon: 18,
  bitcoin: 8,
};

const COINGECKO_ID: Partial<Record<WalletChain, string>> = {
  ethereum: "ethereum",
  arbitrum: "ethereum",
  polygon: "matic-network",
  bitcoin: "bitcoin",
};

let priceCache: { at: number; prices: Record<string, number> } | null = null;

async function nativeUsdPrices(): Promise<Record<string, number>> {
  if (priceCache && Date.now() - priceCache.at < 120_000) {
    return priceCache.prices;
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,matic-network,bitcoin&vs_currencies=usd",
      { next: { revalidate: 120 } },
    );
    if (!res.ok) return priceCache?.prices ?? {};
    const json = (await res.json()) as Record<string, { usd?: number }>;
    const prices = {
      ethereum: json.ethereum?.usd ?? 0,
      "matic-network": json["matic-network"]?.usd ?? 0,
      bitcoin: json.bitcoin?.usd ?? 0,
    };
    priceCache = { at: Date.now(), prices };
    return prices;
  } catch {
    return priceCache?.prices ?? {};
  }
}

async function fetchEvmBalance(chain: Exclude<WalletChain, "bitcoin">, address: string): Promise<number> {
  const rpc = EVM_RPC[chain];
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [address, "latest"],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("RPC unavailable");
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (json.error?.message) throw new Error(json.error.message);
  if (!json.result) throw new Error("No balance");
  return Number(BigInt(json.result)) / 10 ** NATIVE_DECIMALS[chain];
}

async function fetchBtcBalance(address: string): Promise<number> {
  const res = await fetch(`https://mempool.space/api/address/${encodeURIComponent(address)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Bitcoin lookup failed");
  const json = (await res.json()) as {
    chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
  };
  const funded = json.chain_stats?.funded_txo_sum ?? 0;
  const spent = json.chain_stats?.spent_txo_sum ?? 0;
  return (funded - spent) / 10 ** NATIVE_DECIMALS.bitcoin;
}

export async function fetchWalletBalance(
  chain: WalletChain,
  address: string,
): Promise<WalletBalance> {
  const symbol = chainSymbol(chain);
  try {
    const nativeAmount =
      chain === "bitcoin"
        ? await fetchBtcBalance(address)
        : await fetchEvmBalance(chain, address);

    const prices = await nativeUsdPrices();
    const cgId = COINGECKO_ID[chain];
    const usdRate = cgId ? prices[cgId] ?? null : null;
    const usdEstimate = usdRate != null ? nativeAmount * usdRate : null;

    return { nativeAmount, nativeSymbol: symbol, usdEstimate };
  } catch (err) {
    return {
      nativeAmount: 0,
      nativeSymbol: symbol,
      usdEstimate: null,
      error: err instanceof Error ? err.message : "Balance unavailable",
    };
  }
}
