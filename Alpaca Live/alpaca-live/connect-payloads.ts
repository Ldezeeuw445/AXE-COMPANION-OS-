import type { BrokerOAuthExchangeInput, ConnectInput } from "./types";

export const alpacaPaperApiKeyConnect: ConnectInput = {
  userId: "user_123",
  broker: "alpaca",
  environment: "paper",
  authMode: "api_keys",
  credentials: {
    keyId: "PAPER_KEY_ID",
    secretKey: "PAPER_SECRET_KEY",
  },
};

export const alpacaLiveApiKeyConnect: ConnectInput = {
  userId: "user_123",
  broker: "alpaca",
  environment: "live",
  authMode: "api_keys",
  credentials: {
    keyId: "LIVE_KEY_ID",
    secretKey: "LIVE_SECRET_KEY",
  },
};

export const alpacaOAuthConnect: ConnectInput = {
  userId: "user_123",
  broker: "alpaca",
  environment: "live",
  authMode: "oauth",
  credentials: {
    accessToken: "oauth_access_token",
    refreshToken: "oauth_refresh_token",
  },
};

export const alpacaOAuthCodeExchange: BrokerOAuthExchangeInput = {
  userId: "user_123",
  broker: "alpaca",
  environment: "live",
  code: "authorization_code_from_callback",
  redirectUri: "https://yourapp.com/broker/callback/alpaca",
};
