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

export type Erc20TokenBalance = {
  symbol: string;
  contractAddress: string;
  amount: number;
  usdEstimate: number | null;
};

export type WalletBalance = {
  nativeAmount: number;
  nativeSymbol: string;
  /** Native + ERC-20 USD total when pricing is available. */
  usdEstimate: number | null;
  tokens?: Erc20TokenBalance[];
  error?: string;
};

export type CryptoWalletWithBalance = CryptoWalletRow & {
  balance: WalletBalance | null;
};
