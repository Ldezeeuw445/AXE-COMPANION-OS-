import type { WalletChain, WalletProvider } from "@/types/wallets";

export type WalletProviderMeta = {
  id: WalletProvider;
  name: string;
  subtitle: string;
  accent: string;
  logoSrc?: string;
  brandBg: string;
  brandRing: string;
  connectable?: boolean;
};

export const WALLET_PROVIDERS: WalletProviderMeta[] = [
  {
    id: "ledger",
    name: "Ledger",
    subtitle: "Hardware wallet",
    accent: "text-white/90",
    logoSrc: "/wallets/ledger.svg",
    brandBg: "from-white/[0.14] to-white/[0.04]",
    brandRing: "ring-white/20",
    connectable: true,
  },
  {
    id: "tangem",
    name: "Tangem",
    subtitle: "Card wallet",
    accent: "text-sky-300/90",
    logoSrc: "/wallets/tangem.png",
    brandBg: "from-sky-500/20 to-blue-600/10",
    brandRing: "ring-sky-400/25",
    connectable: true,
  },
  {
    id: "trust",
    name: "Trust Wallet",
    subtitle: "Mobile wallet",
    accent: "text-blue-300/90",
    logoSrc: "/wallets/trust.png",
    brandBg: "from-blue-500/20 to-blue-700/10",
    brandRing: "ring-blue-400/25",
    connectable: true,
  },
  {
    id: "metamask",
    name: "MetaMask",
    subtitle: "Browser wallet",
    accent: "text-orange-300/90",
    logoSrc: "/wallets/metamask.svg",
    brandBg: "from-orange-500/20 to-amber-600/10",
    brandRing: "ring-orange-400/25",
    connectable: true,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    subtitle: "Exchange wallet",
    accent: "text-indigo-300/90",
    logoSrc: "/wallets/coinbase.svg",
    brandBg: "from-indigo-500/20 to-blue-500/10",
    brandRing: "ring-indigo-400/25",
    connectable: true,
  },
  {
    id: "rise",
    name: "Rise",
    subtitle: "Payouts · read-only",
    accent: "text-emerald-300/90",
    brandBg: "from-emerald-500/15 to-emerald-700/10",
    brandRing: "ring-emerald-400/20",
  },
  {
    id: "other",
    name: "Other",
    subtitle: "Custom address",
    accent: "text-white/70",
    brandBg: "from-white/[0.08] to-white/[0.03]",
    brandRing: "ring-white/10",
  },
];

export const CONNECTABLE_WALLET_PROVIDERS = WALLET_PROVIDERS.filter((p) => p.connectable);

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
