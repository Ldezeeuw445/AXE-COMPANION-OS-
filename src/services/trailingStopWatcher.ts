/**
 * De bewaker die trailing stops daadwerkelijk verzet.
 *
 * Punt 15 van de rij. `advancedOrders.ts` zegt waar de stop heen moet,
 * `trailingSweep.ts` of hij verzet moet worden; dit bestand praat met
 * Supabase en MetaApi. Alle beslissingen staan in die twee, zodat ze te
 * toetsen zijn zonder netwerk — hier staat alleen het halen en brengen.
 *
 * Eén MetaApi-aanroep per rekening, niet per positie. Een trader met acht
 * trailing stops op hetzelfde account hoort geen acht identieke verzoeken te
 * kosten; deze bewaker draait elke paar minuten en dat loopt anders snel op.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { clientGetPositions, clientModifyPosition } from "@/lib/mt5/metaApiClient";
import {
  type BrokerPosition,
  type SweepSummary,
  type TrailingRow,
  decideTrailingSweep,
  summarizeSweep,
} from "@/lib/trading/trailingSweep";

type Row = {
  id: string;
  user_id: string;
  broker_account_id: string;
  position_id: string;
  symbol: string;
  side: string;
  distance: number | string;
  last_set_stop: number | string | null;
};

export type TrailingSweepResult = SweepSummary & {
  accounts: number;
  errors: string[];
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Lees één MetaApi-positie uit.
 *
 * MetaApi geeft `currentPrice` voor de prijs waartegen de positie nu staat.
 * Ontbreekt die, dan is er niets te beslissen en laten we de positie met rust
 * in plaats van op een geraden prijs een stop te verzetten.
 */
function toBrokerPosition(raw: unknown): BrokerPosition | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = o.id ?? o.positionId;
  if (id === null || id === undefined) return null;
  const price = num(o.currentPrice);
  if (price === null || price <= 0) return null;
  return { positionId: String(id), stopLoss: num(o.stopLoss), price };
}

export async function sweepTrailingStops(
  supabase: SupabaseClient,
  options: { maxRows?: number } = {},
): Promise<TrailingSweepResult> {
  const errors: string[] = [];
  const limit = options.maxRows ?? 200;

  const { data, error } = await supabase
    .from("position_trailing_stops")
    .select("id,user_id,broker_account_id,position_id,symbol,side,distance,last_set_stop")
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { checked: 0, moved: 0, held: 0, forgotten: 0, notes: [], accounts: 0, errors: [`kon de trailing-rijen niet lezen: ${error.message}`] };
  }

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    return { checked: 0, moved: 0, held: 0, forgotten: 0, notes: [], accounts: 0, errors };
  }

  const perAccount = new Map<string, Row[]>();
  for (const row of rows) {
    const list = perAccount.get(row.broker_account_id) ?? [];
    list.push(row);
    perAccount.set(row.broker_account_id, list);
  }

  const decisions = [];
  const vergeten: string[] = [];

  for (const [brokerAccountId, accountRows] of perAccount) {
    const { data: account, error: accErr } = await supabase
      .from("user_broker_accounts")
      .select("id,external_connection_id,metadata")
      .eq("id", brokerAccountId)
      .maybeSingle();

    if (accErr || !account?.external_connection_id) {
      errors.push(`rekening ${brokerAccountId} is niet op te halen`);
      continue;
    }

    const meta =
      account.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
        ? (account.metadata as Record<string, unknown>)
        : {};
    const region = typeof meta.metaapiRegion === "string" ? meta.metaapiRegion : null;

    let positions: unknown[] = [];
    try {
      positions = await clientGetPositions(account.external_connection_id, false, region);
    } catch (e) {
      errors.push(`posities van ${brokerAccountId}: ${e instanceof Error ? e.message : "onbekende fout"}`);
      continue;
    }

    const byId = new Map<string, BrokerPosition>();
    for (const raw of positions) {
      const p = toBrokerPosition(raw);
      if (p) byId.set(p.positionId, p);
    }

    for (const row of accountRows) {
      const distance = num(row.distance);
      if (distance === null || distance <= 0) {
        errors.push(`rij ${row.id} heeft geen bruikbare afstand`);
        continue;
      }

      const trailing: TrailingRow = {
        positionId: row.position_id,
        symbol: row.symbol,
        side: row.side === "sell" ? "sell" : "buy",
        distance,
        lastSetStop: num(row.last_set_stop),
      };

      // `minDistance` blijft null: MetaApi's stopsLevel per symbool wordt
      // hier nog niet opgehaald. Zonder dat getal is een ondergrens een gok,
      // en een gok die te hoog uitvalt houdt een stop tegen die wél mocht.
      // De broker weigert zelf wat te dicht staat; dat komt dan als fout
      // terug in plaats van stil te blijven.
      const decision = decideTrailingSweep(trailing, byId.get(row.position_id) ?? null, null);
      decisions.push(decision);

      if (decision.action === "forget") {
        vergeten.push(row.id);
        continue;
      }
      if (decision.action !== "modify") continue;

      try {
        await clientModifyPosition({
          accountId: account.external_connection_id,
          positionId: row.position_id,
          stopLoss: decision.stop,
          region,
        });
        await supabase
          .from("position_trailing_stops")
          .update({
            last_set_stop: decision.stop,
            last_moved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      } catch (e) {
        // De stop is niet verzet, dus `last_set_stop` blijft staan op wat er
        // wél gelukt is. Volgende ronde probeert hij het opnieuw vanaf de
        // stop die de broker teruggeeft, niet vanaf een aanname.
        errors.push(`modify ${row.position_id}: ${e instanceof Error ? e.message : "onbekende fout"}`);
      }
    }
  }

  if (vergeten.length > 0) {
    const { error: delErr } = await supabase.from("position_trailing_stops").delete().in("id", vergeten);
    if (delErr) errors.push(`kon ${vergeten.length} gesloten posities niet opruimen: ${delErr.message}`);
  }

  return { ...summarizeSweep(decisions), accounts: perAccount.size, errors };
}
