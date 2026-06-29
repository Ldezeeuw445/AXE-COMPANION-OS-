import type { WalletChain, WalletProvider } from "@/types/wallets";

export type WalletProviderMeta = {
  id: WalletProvider;
  name: string;
  subtitle: string;
  accent: string;
};

export const WALLET_PROVIDERS: WalletProviderMeta[] = [
  { id: "ledger", name: "Ledger", subtitle: "Hardware wallet", accent: "text-white/90" },
  { id: "tangem", name: "Tangem", subtitle: "Card wallet", accent: "text-sky-300/90" },
  { id: "trust", name: "Trust Wallet", subtitle: "Mobile wallet", accent: "text-blue-300/90" },
  { id: "metamask", name: "MetaMask", subtitle: "Browser wallet", accent: "text-orange-300/90" },
  { id: "coinbase", name: "Coinbase Wallet", subtitle: "Exchange wallet", accent: "text-indigo-300/90" },
  { id: "rise", name: "Rise", subtitle: "Payouts · read-only", accent: "text-emerald-300/90" },
  { id: "other", name: "Other", subtitle: "Custom address", accent: "text-white/70" },
];

export const WALLET_CHAINS: Array<{ id: WalletChain; label: string; symbol: string }> = [
  { id: "ethereum", label: "Ethereum", symbol: "ETH" },
  { id: "arbitrum", label: "Arbitrum", symbol: "ETH" },
  { id: "polygon", label: "Polygon", symbol: "MATIC" },
  { id: "bitcoin", label: "Bitcoin", symbol: "BTC" },
];

export function providerMeta(id: WalletProvider): WalletProviderMeta {
  return WALLET_PROVIDERS.find((p) => p.id === id) ?? WALLET_PROVIDERS[WALLET_PROVIDERS.length - 1]!;
}

export function chainSymbol(chain: WalletChain): string {
  return WALLET_CHAINS.find((c) => c.id === chain)?.symbol ?? chain.toUpperCase();
}

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const BTC_RE = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/;

export function normalizeWalletAddress(chain: WalletChain, address: string): string {
  const trimmed = address.trim();
  if (chain === "bitcoin") return trimmed;
  return trimmed.toLowerCase();
}

export function isValidWalletAddress(chain: WalletChain, address: string): boolean {
  const a = address.trim();
  if (chain === "bitcoin") return BTC_RE.test(a);
  return EVM_RE.test(a);
}

export const WALLET_PROVIDERS_LIST = WALLET_PROVIDERS.map((p) => p.id);
