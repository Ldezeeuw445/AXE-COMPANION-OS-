/**
 * Wat de trailing-bewaker per positie moet doen.
 *
 * Punt 15 van de rij. `advancedOrders.ts` zegt wáár de stop heen zou moeten;
 * dit bestand zegt of hij verzet moet worden, en wat er aan de hand is als
 * het antwoord nee is. Apart gehouden van de service eromheen zodat de
 * beslissing te toetsen is zonder Supabase of MetaApi.
 *
 * De drie dingen die een bewaker als deze stuk maken:
 *
 * 1. **Onze opgeslagen stop geloven in plaats van die van de broker.** Wij
 *    noteren welke stop we gezet hebben, maar de broker heeft het laatste
 *    woord: een modify kan geweigerd zijn, en de trader kan hem met de hand
 *    hebben verzet. Rekenen vanaf ons eigen briefje betekent dat de bewaker
 *    een stop "verbetert" naar een plek waar hij al niet meer stond.
 *
 * 2. **Stil overschrijven wat iemand anders verzette.** Staat de echte stop
 *    slechter dan wat wij als laatste zetten, dan heeft iemand hem naar
 *    achteren gehaald. Dat is informatie, geen ruis: misschien is de trader
 *    zelf bezig. De bewaker trekt hem dan wél weer mee omhoog — dat is zijn
 *    taak — maar meldt het, zodat het niet onzichtbaar blijft.
 *
 * 3. **Blijven proberen op een positie die niet meer bestaat.** Een
 *    gesloten positie houdt anders voor altijd een rij bezet en levert elke
 *    twee minuten een foutmelding op, waarna niemand de foutmeldingen nog
 *    leest.
 *
 * Afhankelijkheidsvrij op `advancedOrders` na, zodat
 * `scripts/verify-trailing-sweep.mjs` het rechtstreeks kan uitoefenen.
 */
import { type OrderSide, trailingStopUpdate } from "./advancedOrders";

/** De opgeslagen instelling, zoals hij in `position_trailing_stops` staat. */
export type TrailingRow = {
  positionId: string;
  symbol: string;
  side: OrderSide;
  distance: number;
  /** De stop die wij als laatste gezet hebben. Null als we er nog geen zetten. */
  lastSetStop: number | null;
};

/** De positie zoals de broker hem nú teruggeeft. */
export type BrokerPosition = {
  positionId: string;
  /** De stop zoals hij bij de broker staat. Null als er geen is. */
  stopLoss: number | null;
  /** De prijs waar de positie tegen gewaardeerd wordt. */
  price: number;
};

export type SweepDecision =
  | { action: "modify"; positionId: string; stop: number; note: SweepNote | null }
  | { action: "hold"; positionId: string; reason: HoldReason; note: SweepNote | null }
  | { action: "forget"; positionId: string; reason: "positie_bestaat_niet_meer" };

export type HoldReason =
  | "prijs_is_niet_ver_genoeg_gelopen"
  | "afstand_te_klein_voor_de_broker"
  | "onleesbare_invoer"
  | "stop_staat_al_goed";

/** Dingen die het vermelden waard zijn zonder dat ze de sweep tegenhouden. */
export type SweepNote = "stop_was_verzet_door_iemand_anders" | "broker_had_nog_geen_stop";

/**
 * Hoe dicht twee stops mogen liggen voor we ze als dezelfde behandelen.
 *
 * Zonder deze drempel stuurt de bewaker elke twee minuten een modify die de
 * stop een fractie verzet. Dat is honderden broker-aanroepen per dag per
 * positie, en elke aanroep kan geweigerd worden — dus het is niet alleen
 * verspilling maar ook ruis in de foutmeldingen.
 */
export const SAME_STOP_EPSILON_RATIO = 1e-6;

function zelfdeStop(a: number, b: number): boolean {
  const schaal = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= schaal * SAME_STOP_EPSILON_RATIO;
}

/**
 * Beslis wat er met één trailing-rij moet gebeuren.
 *
 * `position` is null als de broker de positie niet meer kent.
 */
export function decideTrailingSweep(
  row: TrailingRow,
  position: BrokerPosition | null,
  minDistance: number | null = null,
): SweepDecision {
  if (!position) {
    return { action: "forget", positionId: row.positionId, reason: "positie_bestaat_niet_meer" };
  }

  // De broker heeft het laatste woord over waar de stop staat. Ons eigen
  // briefje dient alleen om te zien of er iets veranderd is dat wij niet
  // deden.
  const echteStop = Number.isFinite(position.stopLoss as number) ? (position.stopLoss as number) : null;

  let note: SweepNote | null = null;
  if (echteStop === null && row.lastSetStop !== null) {
    note = "broker_had_nog_geen_stop";
  } else if (echteStop !== null && row.lastSetStop !== null && !zelfdeStop(echteStop, row.lastSetStop)) {
    const slechter = row.side === "buy" ? echteStop < row.lastSetStop : echteStop > row.lastSetStop;
    if (slechter) note = "stop_was_verzet_door_iemand_anders";
  }

  const verdict = trailingStopUpdate({
    side: row.side,
    price: position.price,
    currentStop: echteStop,
    distance: row.distance,
    minDistance,
  });

  if (!verdict.moved) {
    return { action: "hold", positionId: row.positionId, reason: verdict.reason, note };
  }

  // De rekenregel zegt "beter", maar bij een verwaarloosbaar verschil is een
  // broker-aanroep het niet waard.
  if (echteStop !== null && zelfdeStop(verdict.stop, echteStop)) {
    return { action: "hold", positionId: row.positionId, reason: "stop_staat_al_goed", note };
  }

  return { action: "modify", positionId: row.positionId, stop: verdict.stop, note };
}

export type SweepSummary = {
  checked: number;
  moved: number;
  held: number;
  forgotten: number;
  notes: SweepNote[];
};

/** Tel een reeks beslissingen op tot wat er in het cron-antwoord komt. */
export function summarizeSweep(decisions: readonly SweepDecision[]): SweepSummary {
  const summary: SweepSummary = { checked: decisions.length, moved: 0, held: 0, forgotten: 0, notes: [] };
  for (const d of decisions) {
    if (d.action === "modify") summary.moved += 1;
    else if (d.action === "hold") summary.held += 1;
    else summary.forgotten += 1;
    if (d.action !== "forget" && d.note) summary.notes.push(d.note);
  }
  return summary;
}
