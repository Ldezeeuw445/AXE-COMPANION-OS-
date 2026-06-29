import "server-only";

import type { WalletChain } from "@/types/wallets";

/** Public RPC endpoints — tried in order (llamarpc blocked on serverless/Cloudflare). */
const EVM_RPC_ENDPOINTS: Record<Exclude<WalletChain, "bitcoin">, readonly string[]> = {
  ethereum: [
    "https://ethereum.publicnode.com",
    "https://1rpc.io/eth",
    "https://eth.drpc.org",
  ],
  arbitrum: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one.publicnode.com"],
  polygon: ["https://polygon-bor.publicnode.com", "https://polygon-rpc.com"],
};

type JsonRpcResponse = {
  result?: string;
  error?: { message?: string };
};

export async function evmJsonRpc(
  chain: Exclude<WalletChain, "bitcoin">,
  body: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  let lastError = "RPC unavailable";

  for (const rpc of EVM_RPC_ENDPOINTS[chain]) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!res.ok) continue;

      const json = (await res.json()) as JsonRpcResponse;
      if (json.error?.message) {
        lastError = json.error.message;
        continue;
      }
      if (json.result != null) return json;
      lastError = "No RPC result";
    } catch (err) {
      lastError = err instanceof Error ? err.message : "RPC unavailable";
    }
  }

  throw new Error(lastError);
}
