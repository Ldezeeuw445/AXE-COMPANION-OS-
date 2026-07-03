import { brokerAdapterRegistry } from "./registry";
import { brokerConnectionStore } from "./store";
import { brokerEventStore } from "./event-store";
import { brokerSecretStore } from "./secret-store";
import { BrokerHubService } from "./service";

export const brokerHubService = new BrokerHubService(
  brokerAdapterRegistry,
  brokerConnectionStore,
  brokerEventStore,
  brokerSecretStore
);
