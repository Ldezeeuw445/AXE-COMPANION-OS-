import { AlpacaAdapter } from "../alpaca-adapter";
import type { BrokerAdapterRegistry } from "../broker-contract";
import { IbkrAdapter } from "../../ibkr-live-ready/ibkr-adapter";
import { brokerEventStore } from "./event-store";
import { brokerSecretStore } from "./secret-store";
import { brokerConnectionStore } from "./store";

export const alpacaAdapter = new AlpacaAdapter({
  resolveConnection: (connectionId) => brokerConnectionStore.getConnection(connectionId),
  resolveCredentials: (connectionId) => brokerSecretStore.getCredentials(connectionId),
  saveCredentials: (connectionId, credentials) => brokerSecretStore.saveCredentials(connectionId, credentials),
  saveConnection: (connection) => brokerConnectionStore.saveConnection(connection),
  onEvent: (event) => brokerEventStore.append(event),
});

export const ibkrAdapter = new IbkrAdapter(
  brokerConnectionStore,
  brokerEventStore
);

export const brokerAdapterRegistry: BrokerAdapterRegistry = {
  get(name) {
    if (name === "alpaca") return alpacaAdapter;
    if (name === "ibkr") return ibkrAdapter;
    throw new Error(`Broker adapter not registered: ${name}`);
  },
  list() {
    return [alpacaAdapter, ibkrAdapter];
  },
};
