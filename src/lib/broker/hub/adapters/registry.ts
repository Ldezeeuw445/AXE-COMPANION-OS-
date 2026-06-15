import type { BrokerAdapterRegistry, BrokerApiAdapter } from "../contract";
import { createAlpacaBrokerApiAdapter } from "./alpacaLive";
import {
  axeDemoBrokerApi,
  ibkrStubBrokerApi,
} from "./stubBrokers";
import { createMt5BrokerApiAdapter } from "./mt5BrokerApi";
import type { SupabaseClient } from "@supabase/supabase-js";

export class AxeBrokerAdapterRegistry implements BrokerAdapterRegistry {
  private readonly map: Map<string, BrokerApiAdapter>;

  constructor(handlers: BrokerApiAdapter[]) {
    this.map = new Map(handlers.map((h) => [h.brokerId, h]));
  }

  get(brokerId: string): BrokerApiAdapter | undefined {
    return this.map.get(brokerId);
  }

  list(): BrokerApiAdapter[] {
    return [...this.map.values()];
  }
}

export function createAxeBrokerRegistry(supabase: SupabaseClient): AxeBrokerAdapterRegistry {
  return new AxeBrokerAdapterRegistry([
    createMt5BrokerApiAdapter(supabase),
    axeDemoBrokerApi,
    createAlpacaBrokerApiAdapter(supabase),
    ibkrStubBrokerApi,
  ]);
}
