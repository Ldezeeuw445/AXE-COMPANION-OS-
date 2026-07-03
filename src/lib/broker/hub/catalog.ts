/**
 * Broker catalog seeded in Supabase `broker_providers` + static fallbacks.
 * Source: https://github.com/Ldezeeuw445/broker-connection-hub
 */
import type { BrokerAdapter } from "./contract";

export const AXE_BROKER_CATALOG: readonly BrokerAdapter[] = [
  {
    id: "mt5-style",
    displayName: "MT5 (MetaApi Cloud)",
    description:
      "MetaTrader 5 via MetaApi — login, server, investor or master password. Forex & CFD.",
    supportedModes: ["live", "readonly"],
    marketData: {
      supportsQuotes: true,
      supportsDepth: true,
      supportsHistoricalBars: true,
      defaultTier: "realtime",
      availableTiers: ["delayed", "realtime"],
    },
    execution: {
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsStopOrders: true,
      supportsBracketOrders: false,
      supportsFractionalShares: false,
    },
    requiredCredentials: [
      { key: "mt5Login", label: "MT5 login", kind: "text", placeholder: "12345678" },
      { key: "mt5Password", label: "Password", kind: "password" },
      { key: "mt5Server", label: "Server", kind: "text", placeholder: "Broker-Live" },
    ],
    optionalCredentials: [
      {
        key: "passwordType",
        label: "Password type",
        kind: "select",
        options: [
          { value: "investor", label: "Investor (read-only)" },
          { value: "master", label: "Master (trading)" },
        ],
      },
    ],
  },
  {
    id: "axe-demo",
    displayName: "AXE Demo Account",
    description: "Virtual paper trading — no broker credentials.",
    supportedModes: ["paper"],
    marketData: {
      supportsQuotes: true,
      supportsDepth: false,
      supportsHistoricalBars: true,
      defaultTier: "realtime",
      availableTiers: ["realtime"],
    },
    execution: {
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsStopOrders: true,
      supportsBracketOrders: false,
      supportsFractionalShares: true,
    },
    requiredCredentials: [],
  },
  {
    id: "alpaca-style",
    displayName: "Alpaca",
    description: "US equities REST + streaming. Paper and live environments.",
    supportedModes: ["paper", "live", "readonly"],
    marketData: {
      supportsQuotes: true,
      supportsDepth: false,
      supportsHistoricalBars: true,
      defaultTier: "realtime",
      availableTiers: ["none", "delayed", "realtime"],
      entitlementsRequired: ["us_equity"],
    },
    execution: {
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsStopOrders: true,
      supportsBracketOrders: true,
      supportsFractionalShares: true,
      minOrderNotional: 1,
    },
    requiredCredentials: [
      { key: "apiKey", label: "API Key", kind: "text" },
      { key: "apiSecret", label: "API Secret", kind: "password" },
    ],
    optionalCredentials: [
      {
        key: "environment",
        label: "Environment",
        kind: "select",
        options: [
          { value: "paper", label: "Paper" },
          { value: "live", label: "Live" },
        ],
      },
    ],
  },
  {
    id: "ibkr-style",
    displayName: "Interactive Brokers",
    description: "IBKR Gateway/TWS with market-data entitlements.",
    supportedModes: ["paper", "live", "readonly"],
    marketData: {
      supportsQuotes: true,
      supportsDepth: true,
      supportsHistoricalBars: true,
      defaultTier: "professional",
      availableTiers: ["delayed", "realtime", "professional"],
      entitlementsRequired: ["us_stocks", "us_options", "forex"],
    },
    execution: {
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsStopOrders: true,
      supportsBracketOrders: true,
      supportsFractionalShares: false,
    },
    requiredCredentials: [
      { key: "username", label: "Username", kind: "text" },
      { key: "password", label: "Password", kind: "password" },
      { key: "accountId", label: "Account ID", kind: "text", placeholder: "U1234567" },
    ],
    optionalCredentials: [
      { key: "port", label: "Gateway port", kind: "number", placeholder: "4002" },
    ],
  },
];

export function catalogEntryForHubId(hubBrokerId: string): BrokerAdapter | undefined {
  return AXE_BROKER_CATALOG.find((b) => b.id === hubBrokerId);
}

export function hubIdForProvider(provider: string, connectionMethod: string | null | undefined): string {
  if (provider === "demo" || connectionMethod === "demo_paper") return "axe-demo";
  if (provider === "alpaca" || connectionMethod === "cloud_alpaca") return "alpaca-style";
  if (provider === "ibkr" || connectionMethod === "cloud_ibkr") return "ibkr-style";
  return "mt5-style";
}
