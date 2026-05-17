import { WatchlistPageScreen } from "@/components/watchlist/WatchlistPageScreen";
import { listWatchlistItems } from "@/app/(app)/settings/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cleanDisplaySymbol, resolveBrokerSymbol } from "@/lib/broker/symbolResolution";

function metadataSymbols(meta: Record<string, unknown>): string[] {
  const raw = meta.symbol_universe;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const symbols = (raw as { symbols?: unknown }).symbols;
  return Array.isArray(symbols) ? symbols.filter((s): s is string => typeof s === "string" && s.length > 0) : [];
}

function symbolMap(meta: Record<string, unknown>): Record<string, string> {
  const raw = meta.symbol_map;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, string>) : {};
}

export default async function WatchlistPage() {
  const items = await listWatchlistItems();
  const supabase = await createServerSupabaseClient();
  if (!supabase) return <WatchlistPageScreen items={items} />;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <WatchlistPageScreen items={items} />;

  const { data: prefs } = await supabase
    .from("user_workspace_preferences")
    .select("active_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const activeId = (prefs?.active_account_id as string | null | undefined) ?? null;
  if (!activeId) return <WatchlistPageScreen items={items} />;

  const { data: account } = await supabase
    .from("user_broker_accounts")
    .select("id,connection_method,provider_status,metadata")
    .eq("user_id", user.id)
    .eq("id", activeId)
    .maybeSingle();

  const metadata = ((account?.metadata ?? {}) as Record<string, unknown>) ?? {};
  const universe = metadataSymbols(metadata);
  const map = symbolMap(metadata);
  const connected = ["connected", "provisioned"].includes(String(account?.provider_status ?? "").toLowerCase());

  const enriched = items.map((item) => {
    const display = cleanDisplaySymbol(item.symbol) || item.symbol.toUpperCase();
    const cached = map[display] ?? map[item.symbol.toUpperCase()];
    const resolved = cached ? { brokerSymbol: cached } : resolveBrokerSymbol(display, universe);
    const supported = universe.length > 0 ? universe.some((s) => s === resolved.brokerSymbol) : Boolean(cached);
    return {
      ...item,
      symbol: display,
      brokerSymbol: resolved.brokerSymbol,
      supportLabel: supported
        ? connected
          ? "Supported"
          : "Mapped"
        : universe.length > 0
          ? "Not found"
          : "Resolving",
      supportTone: supported ? ("live" as const) : universe.length > 0 ? ("warm" as const) : ("muted" as const),
    };
  });

  return <WatchlistPageScreen items={enriched} />;
}
