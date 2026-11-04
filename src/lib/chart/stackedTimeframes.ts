/**
 * Twee timeframes boven elkaar: de bias boven, de uitvoering onder.
 *
 * Punt 16 van de rij. Geen volledige multi-chart layout — dat is Trading OS'
 * werk en past niet op een telefoon. Wel de telefoon-versie van wat een desk
 * met vier schermen doet: dezelfde pair twee keer, zodat de richting en het
 * instapmoment in één blik zitten.
 *
 * De vraag die ertoe doet is **welke** timeframe erboven hoort, en daar gaat
 * een naïeve versie de mist in door "de volgende in de lijst" te pakken. Voor
 * M15 is dat M30, en dan staat er twee keer bijna hetzelfde plaatje: dezelfde
 * swing, dezelfde structuur, een halve dag verschil. Dat kost schermruimte en
 * levert niets op, en erger: het ziet eruit als bevestiging. Twee charts die
 * hetzelfde zeggen omdat ze hetzelfde kijken, leest een trader als twee
 * onafhankelijke signalen.
 *
 * De regel hier is dus een **verhouding**, niet een plek in een lijst. De
 * bias-chart moet minstens vier keer zo grof zijn; dan is het een ander
 * plaatje. Dat levert vanzelf de indeling op die traders met de hand maken:
 * M15 onder H1, H1 onder H4, H4 onder D1, D1 onder W1.
 *
 * Afhankelijkheidsvrij, zodat `scripts/verify-stacked-timeframes.mjs` het
 * rechtstreeks kan uitoefenen.
 */
import { CHART_TF_OPTIONS } from "@/lib/broker/chartTimeframes";

/** Hoeveel minuten één candle beslaat, per timeframe-sleutel. */
export const TF_MINUTES: Record<string, number> = {
  m5: 5,
  m15: 15,
  m30: 30,
  h1: 60,
  h4: 240,
  d1: 1440,
  w1: 7200, // vijf handelsdagen, niet zeven — een FX-week heeft geen weekend
  mn1: 31_680, // 22 handelsdagen
};

/**
 * Hoeveel grover de bias-chart minstens moet zijn.
 *
 * Vier is waar het plaatje echt verandert: één candle boven is vier candles
 * onder, dus een swing die beneden het hele scherm vult is boven een
 * beweging. Lager en je ziet twee keer hetzelfde; veel hoger en de
 * uitvoerings-chart is één candle van de bovenste, waarmee de bovenste niets
 * meer zegt over waar je nú instapt.
 */
export const MIN_BIAS_RATIO = 4;

/**
 * De timeframe die boven deze hoort, of null als er niets grofs genoeg is.
 *
 * Boven MN1 ligt niets, en dat is geen fout: dan hoort er één chart te staan
 * in plaats van een tweede die leeg of zinloos is.
 */
export function companionTimeframe(executionKey: string): string | null {
  const onder = TF_MINUTES[executionKey];
  if (!onder) return null;

  const drempel = onder * MIN_BIAS_RATIO;
  let beste: { key: string; minutes: number } | null = null;

  for (const option of CHART_TF_OPTIONS) {
    const minutes = TF_MINUTES[option.key];
    if (!minutes || minutes < drempel) continue;
    // De kléinste die grof genoeg is: hoe verder weg, hoe minder de
    // bovenste chart nog zegt over het moment waarop je instapt.
    if (!beste || minutes < beste.minutes) beste = { key: option.key, minutes };
  }

  return beste?.key ?? null;
}

/** Of deze combinatie als twee charts boven elkaar zinnig is. */
export function isUsablePair(biasKey: string, executionKey: string): boolean {
  const boven = TF_MINUTES[biasKey];
  const onder = TF_MINUTES[executionKey];
  if (!boven || !onder) return false;
  return boven / onder >= MIN_BIAS_RATIO;
}

/**
 * De kleinste hoogte waarop twee charts beter zijn dan één.
 *
 * Onder deze grens is elke chart een veeg: te weinig pixels om een candle
 * van een doji te onderscheiden, en dan is één leesbare chart meer waard dan
 * twee onleesbare. Gemeten tegen de kleinste telefoon die we bedienen, met
 * de werkbalk en de koersregel er al af.
 */
export const MIN_STACK_HEIGHT_PX = 420;

/** Hoe hoog elke chart mag worden. */
export const MIN_PANE_HEIGHT_PX = 160;

/**
 * Welk deel van de hoogte naar de uitvoerings-chart gaat.
 *
 * Niet de helft. De onderste chart is waar je kijkt en handelt; de bovenste
 * is een blik op de richting. Een gelijke verdeling voelt netjes en werkt
 * slecht.
 */
export const EXECUTION_SHARE = 0.62;

export type StackLayout =
  | { stacked: false; reason: "te_weinig_hoogte" | "geen_bias_timeframe" }
  | { stacked: true; biasKey: string; executionKey: string; biasHeight: number; executionHeight: number };

/**
 * Deel de beschikbare hoogte in tussen de twee charts.
 *
 * Geeft `stacked: false` met een reden in plaats van twee onbruikbare
 * stukken: liever één chart die werkt dan twee die het niet doen.
 */
export function stackLayout(
  executionKey: string,
  availableHeightPx: number,
  biasKeyOverride?: string | null,
): StackLayout {
  const biasKey = biasKeyOverride ?? companionTimeframe(executionKey);
  if (!biasKey || !isUsablePair(biasKey, executionKey)) {
    return { stacked: false, reason: "geen_bias_timeframe" };
  }

  if (!Number.isFinite(availableHeightPx) || availableHeightPx < MIN_STACK_HEIGHT_PX) {
    return { stacked: false, reason: "te_weinig_hoogte" };
  }

  const executionHeight = Math.round(availableHeightPx * EXECUTION_SHARE);
  const biasHeight = availableHeightPx - executionHeight;

  // De afronding kan één van de twee onder de ondergrens duwen bij een
  // hoogte vlak boven MIN_STACK_HEIGHT_PX. Dan liever één chart.
  if (biasHeight < MIN_PANE_HEIGHT_PX || executionHeight < MIN_PANE_HEIGHT_PX) {
    return { stacked: false, reason: "te_weinig_hoogte" };
  }

  return { stacked: true, biasKey, executionKey, biasHeight, executionHeight };
}

/**
 * Hoeveel candles elke chart ophaalt.
 *
 * De bias-chart leest structuur en heeft er minder nodig; de
 * uitvoerings-chart leest het moment en heeft er meer nodig. Even veel
 * ophalen is verspilling aan de ene kant en te weinig aan de andere.
 *
 * Twee constanten en geen functie: ze hangen niet af van de gekozen
 * timeframes, en een functie die zijn argument negeert doet alsof er een
 * afweging is.
 */
export const BIAS_CANDLE_COUNT = 180;
export const EXECUTION_CANDLE_COUNT = 500;
