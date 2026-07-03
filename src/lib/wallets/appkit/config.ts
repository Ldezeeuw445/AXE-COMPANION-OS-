import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { arbitrum, mainnet, polygon } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit-common";
import { getPublicAppBaseUrl } from "@/lib/env";
import type { WalletChain } from "@/types/wallets";

/** Reown / WalletConnect Cloud project ID (public). */
export function getAppKitProjectId(): string {
  return (
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_PROJECT_ID?.trim() ||
    ""
  );
}

export function isAppKitConfigured(): boolean {
  return Boolean(getAppKitProjectId());
}

export const appKitNetworks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, arbitrum, polygon];

export const wagmiAdapter = new WagmiAdapter({
  networks: appKitNetworks,
  projectId: getAppKitProjectId() || "b56e18d47c72ab683b10814fe9495694",
});

export const appKitMetadata = {
  name: "AXE Companion",
  description: "Read-only wallet tracking — AXE never moves funds",
  url: getPublicAppBaseUrl(),
  icons: [`${getPublicAppBaseUrl()}/axe-logo-companion.png`],
};

export const WALLET_CHAIN_TO_ID: Record<Exclude<WalletChain, "bitcoin">, number> = {
  ethereum: mainnet.id,
  arbitrum: arbitrum.id,
  polygon: polygon.id,
};
