import "server-only";

import type { WalletChain } from "@/types/wallets";
import type { CuratedErc20Token } from "@/lib/wallets/tokenCatalog";

const EVM_RPC: Record<Exclude<WalletChain, "bitcoin">, string> = {
  ethereum: "https://eth.llamarpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  polygon: "https://polygon-rpc.com",
};

const BALANCE_OF_SELECTOR = "0x70a08231";

function encodeBalanceOfCalldata(walletAddress: string): string {
  const addr = walletAddress.toLowerCase().replace(/^0x/, "");
  return BALANCE_OF_SELECTOR + addr.padStart(64, "0");
}

async function ethCall(rpc: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("RPC unavailable");
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (json.error?.message) throw new Error(json.error.message);
  if (!json.result || json.result === "0x") return "0x0";
  return json.result;
}

/** Read ERC-20 balance via standard balanceOf(address). */
export async function fetchErc20TokenBalance(
  chain: Exclude<WalletChain, "bitcoin">,
  walletAddress: string,
  token: CuratedErc20Token,
): Promise<number> {
  const rpc = EVM_RPC[chain];
  const raw = await ethCall(rpc, token.contractAddress, encodeBalanceOfCalldata(walletAddress));
  const value = BigInt(raw);
  if (value === 0n) return 0;
  return Number(value) / 10 ** token.decimals;
}
