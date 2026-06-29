export type WalletProvider =
  | "ledger"
  | "tangem"
  | "trust"
  | "metamask"
  | "coinbase"
  | "rise"
  | "other";

export type WalletChain = "ethereum" | "arbitrum" | "polygon" | "bitcoin";

export type CryptoWalletRow = {
  id: string;
  provider: WalletProvider;
  label: string;
  chain: WalletChain;
  address: string;
  notes: string | null;
  created_at: string;
};

export type WalletBalance = {
  nativeAmount: number;
  nativeSymbol: string;
  usdEstimate: number | null;
  error?: string;
};

export type CryptoWalletWithBalance = CryptoWalletRow & {
  balance: WalletBalance | null;
};
