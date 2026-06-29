import "server-only";

import type { WalletChain } from "@/types/wallets";
import type { Erc20TokenBalance, WalletBalance } from "@/types/wallets";
import { chainSymbol } from "@/lib/wallets/walletCatalog";
import { fetchErc20TokenBalance } from "@/lib/wallets/erc20Balance";
import {
  COINGECKO_TOKEN_PLATFORM,
  curatedTokensForChain,
} from "@/lib/wallets/tokenCatalog";
import { fetchErc20TokenUsdPrices, fetchNativeUsdPrices } from "@/lib/wallets/coingeckoClient";

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
let tokenPriceCache: {
  at: number;
  byPlatform: Record<string, Record<string, number>>;
} | null = null;

async function nativeUsdPrices(): Promise<Record<string, number>> {
  if (priceCache && Date.now() - priceCache.at < 120_000) {
    return priceCache.prices;
  }
  try {
    const prices = await fetchNativeUsdPrices();
    priceCache = { at: Date.now(), prices };
    return prices;
  } catch {
    return priceCache?.prices ?? {};
  }
}

async function erc20UsdPrices(
  chain: Exclude<WalletChain, "bitcoin">,
  contractAddresses: string[],
): Promise<Record<string, number>> {
  const platform = COINGECKO_TOKEN_PLATFORM[chain];
  const cacheKey = `${platform}:${contractAddresses.map((a) => a.toLowerCase()).sort().join(",")}`;

  if (tokenPriceCache && Date.now() - tokenPriceCache.at < 120_000) {
    const cached = tokenPriceCache.byPlatform[cacheKey];
    if (cached) return cached;
  }

  try {
    const prices = await fetchErc20TokenUsdPrices(platform, contractAddresses);
    tokenPriceCache = {
      at: Date.now(),
      byPlatform: { ...(tokenPriceCache?.byPlatform ?? {}), [cacheKey]: prices },
    };
    return prices;
  } catch {
    return tokenPriceCache?.byPlatform[cacheKey] ?? {};
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

async function fetchErc20Balances(
  chain: Exclude<WalletChain, "bitcoin">,
  address: string,
): Promise<Erc20TokenBalance[]> {
  const catalog = curatedTokensForChain(chain);
  if (catalog.length === 0) return [];

  const amounts = await Promise.all(
    catalog.map(async (token) => ({
      token,
      amount: await fetchErc20TokenBalance(chain, address, token).catch(() => 0),
    })),
  );

  const held = amounts.filter(({ amount }) => amount > 0);
  if (held.length === 0) return [];

  const priceMap = await erc20UsdPrices(
    chain,
    held.map(({ token }) => token.contractAddress),
  );

  return held.map(({ token, amount }) => {
    const usdRate = priceMap[token.contractAddress.toLowerCase()] ?? null;
    return {
      symbol: token.symbol,
      contractAddress: token.contractAddress,
      amount,
      usdEstimate: usdRate != null ? amount * usdRate : null,
    };
  });
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
    const nativeUsdRate = cgId ? prices[cgId] ?? null : null;
    const nativeUsd = nativeUsdRate != null ? nativeAmount * nativeUsdRate : null;

    const tokens =
      chain === "bitcoin" ? [] : await fetchErc20Balances(chain, address);

    const tokenUsd = tokens.reduce((sum, t) => sum + (t.usdEstimate ?? 0), 0);
    const hasTokenUsd = tokens.some((t) => t.usdEstimate != null);
    const usdEstimate =
      nativeUsd != null || hasTokenUsd
        ? (nativeUsd ?? 0) + tokenUsd
        : null;

    return {
      nativeAmount,
      nativeSymbol: symbol,
      usdEstimate,
      tokens: tokens.length > 0 ? tokens : undefined,
    };
  } catch (err) {
    return {
      nativeAmount: 0,
      nativeSymbol: symbol,
      usdEstimate: null,
      error: err instanceof Error ? err.message : "Balance unavailable",
    };
  }
}
