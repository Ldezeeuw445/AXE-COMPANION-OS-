import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBriefPriceFacts } from "@/services/briefPriceFacts";
import { createChatPriceFactsCache } from "@/lib/briefing/chatPriceGuard";
import type { SymbolFactsResult } from "@/lib/briefing/priceFacts";

/**
 * Live price facts for AXE chat: the briefing loader (MT5 broker feed GET-only,
 * skipped when undeployed → Twelve Data → Yahoo) behind a short per-user
 * cache (60 s ok / 20 s failed). Nothing here deploys or writes to MetaApi.
 */
const cached = createChatPriceFactsCache();

export async function loadChatPriceFacts(
  supabase: SupabaseClient,
  userId: string,
  symbols: string[],
  now = new Date(),
): Promise<SymbolFactsResult[]> {
  return cached(userId, symbols, (missing, at) => loadBriefPriceFacts(supabase, userId, missing, at), now);
}
