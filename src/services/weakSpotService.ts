import type { SupabaseClient } from "@supabase/supabase-js";
import { EVIDENCE_ONLY_FILTER } from "@/lib/trading/tradeEvidence";
import { detectWeakSpots, type WeakSpot, type WeakSpotTrade } from "@/lib/journal/weakSpots";

/**
 * Turns detected weak spots into memories AXE actually carries.
 *
 * This is what closes the loop Luka asked for. `journalingService.loadMemories`
 * reads unresolved rows from `axe_memory` into the prompt for every trade it
 * scores, so a pattern found today changes how tomorrow's trades are judged —
 * the system gets a little sharper about *this* trader each week instead of
 * re-deriving them from nothing.
 *
 * Writes are idempotent per weak-spot id: a pattern that persists updates its
 * own row rather than stacking duplicates, and a pattern that stops firing is
 * resolved rather than left to haunt the prompt forever.
 */

const SOURCE = "journal_analysis";
const LOOKBACK_DAYS = 90;
const MAX_TRADES = 300;

export type WeakSpotRefresh = {
  ok: boolean;
  spots: WeakSpot[];
  written: number;
  resolved: number;
  error?: string;
};

function priorityFor(severity: number): "high" | "medium" | "low" {
  if (severity >= 0.66) return "high";
  if (severity >= 0.33) return "medium";
  return "low";
}

/** The sentence AXE carries into every later judgement. */
function memoryContent(spot: WeakSpot): string {
  return `${spot.title} — ${spot.evidence} Suggested fix: ${spot.proposal}`;
}

export async function loadWeakSpotTrades(
  supabase: SupabaseClient,
  userId: string,
  accountId?: string,
): Promise<WeakSpotTrade[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Practice trades live in this table too. The ones filled at generated
  // prices must not inform `weakSpots` or `playbookEdge`: both turn closed
  // trades into statements about the trader, and a statement built on invented
  // prices is one they will believe because it came from their own journal.
  // See src/lib/trading/tradeEvidence.ts.
  let query = supabase
    .from("broker_trades")
    .select("id,symbol,side,volume,pnl,open_time,close_time")
    .eq("user_id", userId)
    .not("close_time", "is", null)
    .gte("close_time", since)
    .or(EVIDENCE_ONLY_FILTER)
    .order("close_time", { ascending: false })
    .limit(MAX_TRADES);

  if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    symbol: String(row.symbol ?? ""),
    side: String(row.side ?? ""),
    volume: Number(row.volume ?? 0),
    pnl: Number(row.pnl ?? 0),
    openTime: row.open_time ? String(row.open_time) : null,
    closeTime: row.close_time ? String(row.close_time) : null,
  }));
}

export async function refreshWeakSpots(
  supabase: SupabaseClient,
  userId: string,
  accountId?: string,
): Promise<WeakSpotRefresh> {
  const trades = await loadWeakSpotTrades(supabase, userId, accountId);
  const spots = detectWeakSpots(trades);

  // Everything this analyser has ever written for this user and is still live.
  const { data: existing, error } = await supabase
    .from("axe_memory")
    .select("id,metadata,content")
    .eq("user_id", userId)
    .eq("source", SOURCE)
    .is("resolved_at", null);

  if (error) return { ok: false, spots, written: 0, resolved: 0, error: error.message };

  const bySpotId = new Map<string, { id: string; content: string }>();
  for (const row of (existing ?? []) as Array<Record<string, unknown>>) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const spotId = typeof meta.spot_id === "string" ? meta.spot_id : null;
    if (spotId) bySpotId.set(spotId, { id: String(row.id), content: String(row.content ?? "") });
  }

  let written = 0;
  const stillFiring = new Set<string>();

  for (const spot of spots) {
    stillFiring.add(spot.id);
    const content = memoryContent(spot);
    const payload = {
      content,
      priority: priorityFor(spot.severity),
      confidence: Math.round(Math.min(0.95, 0.5 + spot.severity * 0.45) * 100) / 100,
      metadata: {
        spot_id: spot.id,
        severity: spot.severity,
        sample_size: spot.sampleSize,
        proposal: spot.proposal,
        account_id: accountId ?? null,
        detected_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    const current = bySpotId.get(spot.id);
    if (current) {
      // Only write when the sentence actually changed — an unchanged pattern
      // should not keep bumping updated_at and look like fresh news.
      if (current.content === content) continue;
      const { error: updateError } = await supabase
        .from("axe_memory")
        .update(payload)
        .eq("id", current.id)
        .eq("user_id", userId);
      if (!updateError) written += 1;
      continue;
    }

    const { error: insertError } = await supabase.from("axe_memory").insert({
      user_id: userId,
      type: "weakness",
      memory_type: "weakness",
      source: SOURCE,
      ...payload,
    });
    if (!insertError) written += 1;
  }

  // A pattern that stopped firing is progress. Resolve it instead of leaving a
  // stale accusation in every future prompt.
  let resolved = 0;
  for (const [spotId, row] of bySpotId) {
    if (stillFiring.has(spotId)) continue;
    const { error: resolveError } = await supabase
      .from("axe_memory")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (!resolveError) resolved += 1;
  }

  return { ok: true, spots, written, resolved };
}
