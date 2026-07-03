/**
 * Broker Connection Hub — AXE Companion integration
 *
 * @see https://github.com/Ldezeeuw445/broker-connection-hub
 * @see supabase/migrations/20260615120000_broker_connection_hub.sql
 */
export type * from "./contract";
export { AXE_BROKER_CATALOG, catalogEntryForHubId, hubIdForProvider } from "./catalog";
export { BrokerConnectionHubService, createBrokerConnectionHub } from "./service";
export {
  createAxeBrokerConnectionHub,
  createAxeBrokerConnectionHubForSession,
} from "./createHub";
export { syncBrokerHubFromAccountRow } from "./sync";
export {
  dbRowToAccountConnection,
  accountConnectionToDbPatch,
  providerStatusToHubStatus,
  inferTradingMode,
} from "./mappers";
