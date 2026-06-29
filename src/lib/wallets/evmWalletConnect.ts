"use client";

import type { WalletChain, WalletProvider } from "@/types/wallets";

const CHAIN_IDS: Record<Exclude<WalletChain, "bitcoin">, number> = {
  ethereum: 1,
  arbitrum: 42161,
  polygon: 137,
};

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/** Providers that can connect live in-browser / via WalletConnect (read-only address). */
export const LIVE_CONNECT_PROVIDERS: WalletProvider[] = ["metamask", "trust", "coinbase"];

export function supportsLiveWalletConnect(provider: WalletProvider, chain: WalletChain): boolean {
  return chain !== "bitcoin" && LIVE_CONNECT_PROVIDERS.includes(provider);
}

function pickInjectedProvider(provider: WalletProvider): Eip1193Provider | undefined {
  const eth = window.ethereum;
  if (!eth) return undefined;

  const providers = (eth as Eip1193Provider & { providers?: Eip1193Provider[] }).providers;
  if (providers?.length) {
    if (provider === "metamask") {
      return providers.find((p) => p.isMetaMask) ?? providers[0];
    }
    if (provider === "coinbase") {
      return providers.find((p) => p.isCoinbaseWallet) ?? providers[0];
    }
    return providers[0];
  }

  return eth;
}

async function switchChain(injected: Eip1193Provider, chainId: number): Promise<void> {
  const hex = `0x${chainId.toString(16)}`;
  try {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch {
    // Chain may already be active or wallet may not support switch — continue.
  }
}

async function connectInjected(
  provider: WalletProvider,
  chain: Exclude<WalletChain, "bitcoin">,
): Promise<string> {
  const injected = pickInjectedProvider(provider);
  if (!injected) {
    throw new Error("No browser wallet extension found. Paste your public address instead.");
  }

  await switchChain(injected, CHAIN_IDS[chain]);
  const accounts = (await injected.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts[0]?.trim();
  if (!address) throw new Error("Wallet did not return an address.");
  return address;
}

async function connectWalletConnect(
  chain: Exclude<WalletChain, "bitcoin">,
): Promise<string> {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error("WalletConnect is not configured. Paste your public address instead.");
  }

  const { default: EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const chainId = CHAIN_IDS[chain];

  const wc = await EthereumProvider.init({
    projectId,
    chains: [chainId],
    optionalChains: Object.values(CHAIN_IDS),
    showQrModal: true,
    metadata: {
      name: "AXE Companion",
      description: "Read-only wallet tracking — AXE never moves funds",
      url: typeof window !== "undefined" ? window.location.origin : "https://axecompanion.com",
      icons: [`${typeof window !== "undefined" ? window.location.origin : ""}/axe-logo-companion.png`],
    },
  });

  try {
    await wc.connect();
    const accounts = (await wc.request({ method: "eth_accounts" })) as string[];
    const address = accounts[0]?.trim();
    if (!address) throw new Error("WalletConnect did not return an address.");
    return address;
  } finally {
    await wc.disconnect().catch(() => undefined);
  }
}

/**
 * Connect a software wallet read-only — returns the user's public address.
 * Never requests signing or transactions.
 */
export async function connectLiveWallet(
  provider: WalletProvider,
  chain: WalletChain,
): Promise<string> {
  if (chain === "bitcoin") {
    throw new Error("Bitcoin addresses must be added manually.");
  }
  if (!supportsLiveWalletConnect(provider, chain)) {
    throw new Error("This wallet type uses manual address entry (hardware / card).");
  }

  // MetaMask / Coinbase extension: prefer injected provider.
  if (provider === "metamask" || provider === "coinbase") {
    const injected = pickInjectedProvider(provider);
    if (injected) {
      return connectInjected(provider, chain);
    }
  }

  // Trust + mobile / fallback: WalletConnect QR.
  return connectWalletConnect(chain);
}
