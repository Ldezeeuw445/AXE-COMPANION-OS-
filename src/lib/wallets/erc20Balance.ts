import "server-only";

import type { WalletChain } from "@/types/wallets";
import type { CuratedErc20Token } from "@/lib/wallets/tokenCatalog";
import { evmJsonRpc } from "@/lib/wallets/evmRpc";

const BALANCE_OF_SELECTOR = "0x70a08231";

function encodeBalanceOfCalldata(walletAddress: string): string {
  const addr = walletAddress.toLowerCase().replace(/^0x/, "");
  return BALANCE_OF_SELECTOR + addr.padStart(64, "0");
}

async function ethCall(chain: Exclude<WalletChain, "bitcoin">, to: string, data: string): Promise<string> {
  const json = await evmJsonRpc(chain, {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to, data }, "latest"],
  });
  if (!json.result || json.result === "0x") return "0x0";
  return json.result;
}

/** Read ERC-20 balance via standard balanceOf(address). */
export async function fetchErc20TokenBalance(
  chain: Exclude<WalletChain, "bitcoin">,
  walletAddress: string,
  token: CuratedErc20Token,
): Promise<number> {
  const raw = await ethCall(chain, token.contractAddress, encodeBalanceOfCalldata(walletAddress));
  const value = BigInt(raw);
  if (value === 0n) return 0;
  return Number(value) / 10 ** token.decimals;
}
