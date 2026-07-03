"use client";

import { AppKitProvider } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";
import {
  appKitMetadata,
  appKitNetworks,
  getAppKitProjectId,
  isAppKitConfigured,
  wagmiAdapter,
} from "@/lib/wallets/appkit/config";

type WalletsAppKitProviderProps = {
  children: ReactNode;
  cookies: string | null;
};

export function WalletsAppKitProvider({ children, cookies }: WalletsAppKitProviderProps) {
  const [queryClient] = useState(() => new QueryClient());

  if (!isAppKitConfigured()) {
    return children;
  }

  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies);

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <AppKitProvider
          adapters={[wagmiAdapter]}
          networks={appKitNetworks}
          projectId={getAppKitProjectId()}
          metadata={appKitMetadata}
          themeMode="dark"
          features={{
            analytics: false,
            email: false,
            socials: false,
            onramp: false,
            swaps: false,
          }}
        >
          {children}
        </AppKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
