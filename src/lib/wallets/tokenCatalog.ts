import type { WalletChain } from "@/types/wallets";

export type CuratedErc20Token = {
  symbol: string;
  contractAddress: string;
  decimals: number;
};

/** CoinGecko asset platform id for /simple/token_price/{platform} */
export const COINGECKO_TOKEN_PLATFORM: Record<Exclude<WalletChain, "bitcoin">, string> = {
  ethereum: "ethereum",
  arbitrum: "arbitrum-one",
  polygon: "polygon-pos",
};

/** Popular ERC-20 tokens tracked read-only per EVM chain (stables + WETH). */
export const CURATED_ERC20_TOKENS: Record<Exclude<WalletChain, "bitcoin">, CuratedErc20Token[]> = {
  ethereum: [
    { symbol: "USDC", contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
    { symbol: "USDT", contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
    { symbol: "WETH", contractAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", decimals: 18 },
    { symbol: "DAI", contractAddress: "0x6b175474e89094c44da98b954eedeac495271d0f", decimals: 18 },
  ],
  arbitrum: [
    { symbol: "USDC", contractAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", decimals: 6 },
    { symbol: "USDT", contractAddress: "0xfd086bc7cd5c481dcc9dc8eb81bfb9c385e8f8f", decimals: 6 },
    { symbol: "WETH", contractAddress: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", decimals: 18 },
  ],
  polygon: [
    { symbol: "USDC", contractAddress: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6 },
    { symbol: "USDC.e", contractAddress: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", decimals: 6 },
    { symbol: "USDT", contractAddress: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6 },
    { symbol: "WETH", contractAddress: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", decimals: 18 },
  ],
};

export function curatedTokensForChain(chain: WalletChain): CuratedErc20Token[] {
  if (chain === "bitcoin") return [];
  return CURATED_ERC20_TOKENS[chain];
}
