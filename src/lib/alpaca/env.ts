export type AlpacaEnvConfig = {
  keyId: string;
  secretKey: string;
  tradingBaseUrl: string;
  dataBaseUrl: string;
  paper: boolean;
};

const DEFAULT_PAPER_TRADING = "https://paper-api.alpaca.markets";
const DEFAULT_DATA = "https://data.alpaca.markets";

/** Platform-managed Alpaca paper credentials (server env). */
export function getAlpacaPaperConfig(): AlpacaEnvConfig | null {
  const keyId =
    process.env.ALPACA_PAPER_API_KEY_ID?.trim() ||
    process.env.ALPACA_API_KEY_ID?.trim() ||
    "";
  const secretKey =
    process.env.ALPACA_PAPER_API_SECRET_KEY?.trim() ||
    process.env.ALPACA_API_SECRET_KEY?.trim() ||
    "";
  if (!keyId || !secretKey) return null;

  return {
    keyId,
    secretKey,
    tradingBaseUrl:
      process.env.ALPACA_PAPER_BASE_URL?.trim() ||
      process.env.ALPACA_TRADING_BASE_URL?.trim() ||
      DEFAULT_PAPER_TRADING,
    dataBaseUrl: process.env.ALPACA_DATA_BASE_URL?.trim() || DEFAULT_DATA,
    paper: true,
  };
}

export function isAlpacaConfigured(): boolean {
  return getAlpacaPaperConfig() != null;
}
