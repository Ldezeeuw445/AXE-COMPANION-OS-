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

const LEDGER_STYLE = {
  accent: "text-white/90",
  brandBg: "from-white/[0.14] to-white/[0.04]",
  brandRing: "ring-white/20",
} as const;

const BLUE_WALLET_STYLE = {
  accent: "text-blue-300/90",
  brandBg: "from-blue-500/20 to-blue-700/10",
  brandRing: "ring-blue-400/25",
} as const;

const METAMASK_STYLE = {
  accent: "text-orange-300/90",
  brandBg: "from-orange-500/20 to-amber-600/10",
  brandRing: "ring-orange-400/25",
} as const;

export const WALLET_PROVIDERS: WalletProviderMeta[] = [
  {
    id: "ledger",
    name: "Ledger",
    subtitle: "Hardware · paste address",
    logoSrc: "/wallets/ledger.svg",
    connectable: true,
    ...LEDGER_STYLE,
  },
  {
    id: "tangem",
    name: "Tangem",
    subtitle: "Card · paste address",
    logoSrc: "/wallets/tangem.png",
    connectable: true,
    ...LEDGER_STYLE,
  },
  {
    id: "trust",
    name: "Trust Wallet",
    subtitle: "Connect or paste address",
    logoSrc: "/wallets/trust.png",
    connectable: true,
    ...BLUE_WALLET_STYLE,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    subtitle: "Connect or paste address",
    logoSrc: "/wallets/coinbase.svg",
    connectable: true,
    ...BLUE_WALLET_STYLE,
  },
  {
    id: "metamask",
    name: "MetaMask",
    subtitle: "Connect or paste address",
    logoSrc: "/wallets/metamask.svg",
    connectable: true,
    ...METAMASK_STYLE,
  },
  {
    id: "rise",
    name: "Rise",
    subtitle: "Payouts · paste address",
    logoSrc: "/wallets/rise.png",
    connectable: true,
    ...METAMASK_STYLE,
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

/** Connect grid order: Ledger | Tangem · Trust | Coinbase · MetaMask | Rise */
export const WALLET_GRID_PROVIDERS = WALLET_PROVIDERS.filter((p) => p.connectable);

export const CONNECTABLE_WALLET_PROVIDERS = WALLET_GRID_PROVIDERS;

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
