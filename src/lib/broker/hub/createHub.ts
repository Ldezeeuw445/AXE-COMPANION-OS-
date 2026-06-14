import type { SupabaseClient } from "@supabase/supabase-js";
import { AXE_BROKER_CATALOG } from "./catalog";
import { SupabaseDatabaseAdapter } from "./adapters/supabaseDatabase";
import { SupabaseAuthAdapter, authAdapterForUser } from "./adapters/supabaseAuth";
import { SupabaseSecretsAdapter } from "./adapters/supabaseSecrets";
import { createAxeBrokerRegistry } from "./adapters/registry";
import { createBrokerConnectionHub, BrokerConnectionHubService } from "./service";

/** Server-side Broker Connection Hub wired to Supabase + AXE broker adapters. */
export function createAxeBrokerConnectionHub(
  supabase: SupabaseClient,
  userId: string,
): BrokerConnectionHubService {
  return createBrokerConnectionHub({
    database: new SupabaseDatabaseAdapter(supabase),
    auth: authAdapterForUser(userId),
    secrets: new SupabaseSecretsAdapter(supabase, userId),
    brokers: createAxeBrokerRegistry(supabase),
    brokerCatalog: AXE_BROKER_CATALOG,
  });
}

export async function createAxeBrokerConnectionHubForSession(
  supabase: SupabaseClient,
): Promise<{ hub: BrokerConnectionHubService; userId: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    userId: user.id,
    hub: createAxeBrokerConnectionHub(supabase, user.id),
  };
}
