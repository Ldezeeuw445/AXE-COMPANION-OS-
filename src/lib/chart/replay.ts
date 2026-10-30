/**
 * Bar replay: de chart terugspoelen en bar voor bar vooruit laten lopen.
 *
 * Punt 13 van de rij. Dit is hoe mensen op TradingView leren, en sinds vorige
 * week staat er een oefenaccount naast: replay plus papier is een oefenlus
 * zonder geld en zonder wachten op de markt.
 *
 * Het snijden zelf is één regel — `candles.slice(0, index + 1)`. Alles wat
 * hier staat gaat over het enige dat replay kan verpesten: **vooruitkijken**.
 * Een replay die ergens de toekomst laat zien leert precies het omgekeerde
 * van wat hij belooft, en de trader merkt het niet, want zijn resultaten zien
 * er alleen maar beter uit.
 *
 * Drie plekken waar die toekomst binnenlekt, en wat dit bestand eraan doet:
 *
 * 1. **De indicatoren.** `indicatorMath.ts` is puur en rekent over de array
 *    die hij krijgt, dus een afgekapte reeks kan niets van later weten. Die
 *    is dus al goed — mits de aanroeper de *afgekapte* reeks doorgeeft en
 *    niet de hele. `visibleCandles` is daarvoor.
 *
 * 2. **De opwarmtijd.** Replay beginnen bij candle 3 met een EMA over 200
 *    tekent een lijn die ruis is maar er als een signaal uitziet. Daarom kan
 *    de replay niet eerder beginnen dan de langste periode die aanstaat.
 *
 * 3. **Het moment van beslissen.** Dit is de belangrijkste, en de makkelijkste
 *    om over het hoofd te zien. De laatste zichtbare candle is *afgesloten*:
 *    zijn slotkoers staat er al. Wie op dat moment een order laat vullen op
 *    diezelfde candle, handelt op een koers die hij al kende. Dat is geen
 *    oefening maar een garantie. Een beslissing op bar i vult daarom op zijn
 *    vroegst op bar i+1 — en staat de laatste bar, dan is er niets om op te
 *    vullen en kan er niet gehandeld worden.
 *
 * Afhankelijkheidsvrij, zodat `scripts/verify-replay.mjs` het rechtstreeks
 * kan uitoefenen.
 *
 * **Nog niet aan het scherm gehangen.** Dit is de kern, niet de knop.
 * `ChartScreen.tsx` is 5700 regels en gebruikt `data.candles` op vijftien
 * plekken voor verschillende dingen — de live spiegel, de afstand tot het
 * plan, de tekenlaag. Replay daar half inhangen levert een replay op die op
 * één van die plekken alsnog het heden toont, en dat is precies waar dit
 * bestand tegen bestaat. Wat er nog moet gebeuren staat bij punt 13 in
 * `docs/AUTOPILOT.md`.
 */

export type ReplayState = {
  /** Index van de laatste zichtbare candle. */
  index: number;
  /** Hoeveel candles er in totaal zijn. */
  total: number;
  /** Candles die de indicatoren nodig hebben voor ze iets betekenen. */
  warmupBars: number;
};

/**
 * De vroegste bar waar replay mag beginnen.
 *
 * Eén candle ná de opwarmtijd, want een indicator met periode N heeft N
 * candles nodig vóór zijn eerste waarde.
 */
export function earliestReplayIndex(warmupBars: number): number {
  const warm = Number.isFinite(warmupBars) ? Math.max(0, Math.floor(warmupBars)) : 0;
  return warm;
}

/** Houd een index binnen de bruikbare band, of geef de dichtstbijzijnde rand. */
export function clampReplayIndex(index: number, total: number, warmupBars: number): number {
  const last = Math.max(0, total - 1);
  const first = Math.min(earliestReplayIndex(warmupBars), last);
  if (!Number.isFinite(index)) return first;
  return Math.min(Math.max(Math.floor(index), first), last);
}

/**
 * Begin een replay.
 *
 * Zonder `at` begint hij halverwege het bruikbare deel: ver genoeg terug om
 * iets te zien gebeuren, ver genoeg vooruit dat er geschiedenis op de chart
 * staat om een beslissing op te baseren.
 */
export function startReplay(total: number, warmupBars: number, at?: number): ReplayState {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const warm = earliestReplayIndex(warmupBars);
  const first = Math.min(warm, Math.max(0, safeTotal - 1));
  const last = Math.max(0, safeTotal - 1);
  const midden = first + Math.floor((last - first) / 2);
  return {
    index: clampReplayIndex(at === undefined ? midden : at, safeTotal, warm),
    total: safeTotal,
    warmupBars: warm,
  };
}

export function stepForward(state: ReplayState): ReplayState {
  return { ...state, index: clampReplayIndex(state.index + 1, state.total, state.warmupBars) };
}

export function stepBack(state: ReplayState): ReplayState {
  return { ...state, index: clampReplayIndex(state.index - 1, state.total, state.warmupBars) };
}

/** Staat de replay op de laatste candle, en is er dus niets meer af te spelen? */
export function isAtEnd(state: ReplayState): boolean {
  return state.total === 0 || state.index >= state.total - 1;
}

/**
 * De candles die de trader mag zien.
 *
 * Geef deze door aan `indicatorMath`, niet de hele reeks. Dat is het hele
 * verschil tussen een replay en een chart met een schuifbalk.
 */
export function visibleCandles<T>(candles: readonly T[], state: ReplayState): T[] {
  if (candles.length === 0) return [];
  const last = clampReplayIndex(state.index, candles.length, state.warmupBars);
  return candles.slice(0, last + 1);
}

/**
 * Op welke candle een order mag vullen die nú besloten wordt.
 *
 * `null` als er geen volgende candle is: op de laatste bar is er niets meer
 * om op te vullen. Dat weigeren is eerlijker dan vullen op de bar die al
 * dicht is.
 */
export function fillIndexFor(state: ReplayState): number | null {
  if (state.total === 0) return null;
  const next = state.index + 1;
  return next <= state.total - 1 ? next : null;
}

/**
 * Wat de chart tijdens replay niet mag tonen.
 *
 * Deze lijst is er zodat er één plek is waar het staat en één plek waar het
 * nagemeten wordt. Elk van deze dingen komt uit het heden en zou de uitkomst
 * verklappen van wat de trader nog moet beslissen.
 */
export const REPLAY_SUPPRESSES = [
  // De echte bied- en laatprijs van nu, tientallen bars verderop.
  "liveQuote",
  // De tick-stroom die hem elke seconde bijwerkt.
  "liveTicks",
  // Dag-hoog en dag-laag over de hele dag, inclusief het deel dat nog moet
  // komen. Dit is de stilste van allemaal: het is één lijn op de chart en hij
  // vertelt precies waar de prijs nog heen gaat.
  "previousDayLevels",
  // Open posities en orders van nu, op koersen die in de replay nog niet
  // bestaan.
  "livePositions",
] as const;

export type ReplaySuppressed = (typeof REPLAY_SUPPRESSES)[number];

/**
 * De koers waarop de trader tijdens replay kijkt.
 *
 * Altijd de slotkoers van de laatste zichtbare candle — nooit de live prijs.
 * Geeft `null` als er niets zichtbaar is, zodat de aanroeper niet per ongeluk
 * op nul handelt.
 */
export function replayPrice(
  candles: readonly { close: number }[],
  state: ReplayState,
): number | null {
  const zichtbaar = visibleCandles(candles, state);
  const laatste = zichtbaar[zichtbaar.length - 1];
  if (!laatste || !Number.isFinite(laatste.close)) return null;
  return laatste.close;
}
