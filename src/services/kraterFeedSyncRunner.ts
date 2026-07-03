import {
  amsterdamContentDate,
  broadcastAlreadySyncedToday,
  isKraterSyncWindow,
  upsertBroadcastFeedItem,
  type BroadcastType,
} from "@/services/broadcastFeedService";
import {
  defaultBroadcastTitle,
  fetchKraterBroadcastOutput,
  normalizeBroadcastBody,
  probeKraterBroadcastSource,
  type KraterBroadcastType,
} from "@/services/kraterFeedSyncService";

export type KraterFeedSyncResult = {
  broadcastType: BroadcastType;
  status: "skipped" | "synced" | "failed";
  reason?: string;
  source?: string;
  id?: string;
};

async function syncOne(
  broadcastType: BroadcastType,
  opts?: { force?: boolean },
): Promise<KraterFeedSyncResult> {
  const contentDate = amsterdamContentDate();

  if (!opts?.force && !isKraterSyncWindow(broadcastType)) {
    return {
      broadcastType,
      status: "skipped",
      reason: "outside_amsterdam_sync_window",
    };
  }

  if (!opts?.force && (await broadcastAlreadySyncedToday(broadcastType, contentDate))) {
    return {
      broadcastType,
      status: "skipped",
      reason: "already_synced_today",
    };
  }

  try {
    const { body, source } = await fetchKraterBroadcastOutput(broadcastType);
    const row = await upsertBroadcastFeedItem({
      broadcastType,
      title: defaultBroadcastTitle(broadcastType),
      body: normalizeBroadcastBody(body),
      contentDate,
      externalKey: `${broadcastType}:${contentDate}:${source}`,
      source,
    });

    return {
      broadcastType,
      status: "synced",
      source,
      id: row.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[krater-feed-sync] ${broadcastType} failed`, message);
    return {
      broadcastType,
      status: "failed",
      reason: message,
    };
  }
}

export async function runKraterFeedSync(opts?: {
  force?: boolean;
  types?: BroadcastType[];
}): Promise<KraterFeedSyncResult[]> {
  const types = opts?.types ?? (["daily_news", "market_recap"] as BroadcastType[]);
  const results: KraterFeedSyncResult[] = [];
  for (const broadcastType of types) {
    results.push(await syncOne(broadcastType, { force: opts?.force }));
  }
  return results;
}
