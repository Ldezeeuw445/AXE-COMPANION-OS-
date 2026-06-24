import type { BrokerCapabilities, BrokerEnvironment } from "./types";

export const ALPACA_CAPABILITIES: BrokerCapabilities = {
  paper: true,
  live: true,
  oauthConnect: true,
  marketData: true,
  orderPlacement: true,
  orderCancel: true,
  positions: true,
  portfolioHistory: true,
  accountUpdatesStream: true,
  marketDataStream: true,
  news: true,
  depthSource: "synthetic",
};

export interface AlpacaEnvironmentConfig {
  environment: BrokerEnvironment;
  tradingUrl: string;
  streamUrl: string;
  dataUrl: string;
}

export interface AlpacaOAuthConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  scopes: string[];
  authorizeUrl: string;
  tokenUrl: string;
}

export function getAlpacaEnvironmentConfig(environment: BrokerEnvironment): AlpacaEnvironmentConfig {
  if (environment === "live") {
    return {
      environment,
      tradingUrl: process.env.ALPACA_TRADING_URL_LIVE || "https://api.alpaca.markets",
      streamUrl: process.env.ALPACA_STREAM_URL_LIVE || "wss://api.alpaca.markets/stream",
      dataUrl: process.env.ALPACA_DATA_URL || "https://data.alpaca.markets",
    };
  }

  return {
    environment,
    tradingUrl: process.env.ALPACA_TRADING_URL_PAPER || "https://paper-api.alpaca.markets",
    streamUrl: process.env.ALPACA_STREAM_URL_PAPER || "wss://paper-api.alpaca.markets/stream",
    dataUrl: process.env.ALPACA_DATA_URL || "https://data.alpaca.markets",
  };
}

export function getAlpacaApiHeaders(keyId: string, secretKey: string) {
  return {
    "APCA-API-KEY-ID": keyId,
    "APCA-API-SECRET-KEY": secretKey,
    "Content-Type": "application/json",
  };
}

export function getAlpacaOAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export function getAlpacaOAuthConfig(): AlpacaOAuthConfig {
  return {
    enabled: process.env.ALPACA_ENABLE_OAUTH_CONNECT === "true",
    clientId: process.env.ALPACA_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.ALPACA_OAUTH_CLIENT_SECRET || "",
    redirectUri: process.env.ALPACA_OAUTH_REDIRECT_URI || undefined,
    scopes: (process.env.ALPACA_OAUTH_SCOPES || "")
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
    authorizeUrl: process.env.ALPACA_OAUTH_AUTHORIZE_URL || "https://app.alpaca.markets/oauth/authorize",
    tokenUrl: process.env.ALPACA_OAUTH_TOKEN_URL || "https://authx.alpaca.markets/v1/oauth2/token",
  };
}

export const ALPACA_ENDPOINTS = {
  account: "/v2/account",
  positions: "/v2/positions",
  orders: "/v2/orders",
  portfolioHistory: "/v2/account/portfolio/history",
  latestQuoteStocks: "/v2/stocks/{symbol}/quotes/latest",
  latestQuoteCrypto: "/v1beta3/crypto/{loc}/latest/quotes",
  news: "/v1beta1/news",
};
