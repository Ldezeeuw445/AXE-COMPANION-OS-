"use client";

import { useMemo, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
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

export function ConnectWalletButton({
  provider,
  chain,
  onConnected,
  onError,
  className,
}: ConnectWalletButtonProps) {
  const [connecting, setConnecting] = useState(false);

  const hasWalletConnect = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim());
  const hasInjected = typeof window !== "undefined" && Boolean(window.ethereum);

  const hint = useMemo(() => {
    if (!supportsLiveWalletConnect(provider, chain)) {
      if (chain === "bitcoin") {
        return "Paste your Bitcoin receive address — live connect is not available for BTC yet.";
      }
      return "Paste the public address from your device — hardware and card wallets connect manually.";
    }
    if (provider === "trust" || (!hasInjected && provider !== "metamask")) {
      return hasWalletConnect
        ? "Opens WalletConnect — approve read-only address access in your app."
        : "WalletConnect not configured — paste your public address below.";
    }
    return "Opens your browser wallet extension — read-only, no transactions.";
  }, [chain, hasInjected, hasWalletConnect, provider]);

  if (!supportsLiveWalletConnect(provider, chain)) {
    return <p className="text-[11px] leading-relaxed text-tos-dim">{hint}</p>;
  }

  const disabled =
    connecting ||
    ((provider === "trust" || provider === "coinbase") && !hasWalletConnect && !hasInjected);

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        disabled={disabled}
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
