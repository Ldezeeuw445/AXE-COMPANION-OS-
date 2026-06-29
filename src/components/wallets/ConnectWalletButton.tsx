"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { useAppKit, useAppKitAccount, useAppKitState } from "@reown/appkit/react";
import { useSwitchChain } from "wagmi";
import {
  isAppKitConfigured,
  WALLET_CHAIN_TO_ID,
} from "@/lib/wallets/appkit/config";
import {
  connectLiveWallet,
  supportsLiveWalletConnect,
} from "@/lib/wallets/evmWalletConnect";
import type { WalletChain, WalletProvider } from "@/types/wallets";
import { cn } from "@/lib/utils";

type ConnectWalletButtonProps = {
  provider: WalletProvider;
  chain: WalletChain;
  onConnected: (address: string) => void;
  onError: (message: string) => void;
  className?: string;
};

function useConnectHint(provider: WalletProvider, chain: WalletChain): string {
  const hasAppKit = isAppKitConfigured();

  return useMemo(() => {
    if (!supportsLiveWalletConnect(provider, chain)) {
      if (chain === "bitcoin") {
        return "Paste your Bitcoin receive address — live connect is not available for BTC yet.";
      }
      return "Paste the public address from your device — hardware and card wallets connect manually.";
    }
    if (hasAppKit) {
      return "Opens the AXE wallet picker (MetaMask, Trust, Coinbase, WalletConnect). Read-only — no transactions.";
    }
    return "Paste your public address below, or configure a Reown project ID for live connect.";
  }, [chain, hasAppKit, provider]);
}

function AppKitConnectButton({
  provider,
  chain,
  onConnected,
  onError,
  className,
}: ConnectWalletButtonProps) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { open: modalOpen } = useAppKitState();
  const { switchChainAsync } = useSwitchChain();
  const [connecting, setConnecting] = useState(false);
  const awaitingAddress = useRef(false);
  const hint = useConnectHint(provider, chain);

  useEffect(() => {
    if (!awaitingAddress.current || !isConnected || !address) return;
    awaitingAddress.current = false;
    setConnecting(false);
    onConnected(address);
  }, [address, isConnected, onConnected]);

  useEffect(() => {
    if (!awaitingAddress.current || modalOpen) return;
    if (!isConnected) {
      awaitingAddress.current = false;
      setConnecting(false);
    }
  }, [isConnected, modalOpen]);

  if (!supportsLiveWalletConnect(provider, chain)) {
    return <p className="text-[11px] leading-relaxed text-tos-dim">{hint}</p>;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        disabled={connecting}
        onClick={() => {
          setConnecting(true);
          onError("");
          awaitingAddress.current = true;
          void (async () => {
            try {
              if (chain !== "bitcoin") {
                try {
                  await switchChainAsync({ chainId: WALLET_CHAIN_TO_ID[chain] });
                } catch {
                  // User can pick network in the AppKit modal.
                }
              }
              await open({ view: "Connect" });
            } catch (e) {
              awaitingAddress.current = false;
              setConnecting(false);
              onError(e instanceof Error ? e.message : "Could not open wallet picker");
            }
          })();
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/15 disabled:opacity-40"
      >
        {connecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      <p className="text-[10px] leading-relaxed text-tos-dim">{hint}</p>
    </div>
  );
}

function LegacyConnectButton({
  provider,
  chain,
  onConnected,
  onError,
  className,
}: ConnectWalletButtonProps) {
  const [connecting, setConnecting] = useState(false);
  const hint = useConnectHint(provider, chain);

  if (!supportsLiveWalletConnect(provider, chain)) {
    return <p className="text-[11px] leading-relaxed text-tos-dim">{hint}</p>;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        disabled={connecting}
        onClick={() => {
          setConnecting(true);
          onError("");
          void connectLiveWallet(provider, chain)
            .then(onConnected)
            .catch((e) => onError(e instanceof Error ? e.message : "Could not connect wallet"))
            .finally(() => setConnecting(false));
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/15 disabled:opacity-40"
      >
        {connecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      <p className="text-[10px] leading-relaxed text-tos-dim">{hint}</p>
    </div>
  );
}

export function ConnectWalletButton(props: ConnectWalletButtonProps) {
  if (isAppKitConfigured()) {
    return <AppKitConnectButton {...props} />;
  }
  return <LegacyConnectButton {...props} />;
}
