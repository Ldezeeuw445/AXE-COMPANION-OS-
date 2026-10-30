/**
 * Week- en maandcandles, gevouwen uit dagcandles.
 *
 * Punt 12 van de rij vraagt om W1 en MN1, en waarschuwt erbij: meet eerst of
 * MetaApi ze teruggeeft, want een timeframe die leeg blijft is erger dan geen
 * knop. Dat is precies de reden om ze hier níet bij MetaApi op te halen.
 *
 * Een weekcandle is geen eigen meting — het is dezelfde prijs, grover bekeken.
 * Vouwen we hem uit de dagcandles die de app al ophaalt, dan kan W1 per
 * definitie niet leeg zijn als D1 werkt, hoeft geen broker iets te
 * ondersteunen, en is er niets te meten dat mis kan gaan. M1 ligt anders: dat
 * is wél een eigen meting en kan alleen van de broker komen.
 *
 * De weekgrens volgt de **brokerdag**, niet UTC. FX opent zondagavond, en op
 * een UTC-sleutel is dat een eigen dag van twee uur — die zou als zijn eigen
 * week eindigen. Op de brokerdag hoort zondagavond bij maandag, zoals MT5 het
 * ook toont. Zie `sessionDay.ts`, waar die redenering al staat.
 *
 * Afhankelijkheidsvrij, zodat `scripts/verify-aggregate-candles.mjs` het
 * rechtstreeks kan uitoefenen.
 */
import { sessionDayKey } from "./sessionDay";

/** Wat een candle minimaal moet hebben om te vouwen. */
export type FoldableCandle = {
  /** Unix-seconden van het begin van de periode. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type FoldedCandle = FoldableCandle & {
  /** Hoeveel dagcandles er in zitten. Een feestdagenweek heeft er vier. */
  sourceCount: number;
  /**
   * Of de periode bewijsbaar is afgelopen.
   *
   * Alleen waar als er een látere periode in de invoer zit. De laatste bucket
   * is nooit compleet: niets in de data bewijst dat de week gesloten is, en
   * een halve week als voldragen candle tekenen is hoe een chart iemand een
   * omkeerpatroon laat zien dat vrijdag nog kan verdwijnen.
   */
  complete: boolean;
};

/**
 * De maandag van de week waar deze brokerdag in valt, als `YYYY-MM-DD`.
 *
 * Werkt op de datumsleutel en niet op de tijdstempel, want de sleutel draagt
 * de tijdzone van de broker al. Rekenen in UTC op een `YYYY-MM-DD` is daarna
 * veilig: er zit geen tijd meer in die kan verschuiven.
 */
export function weekKeyFromDayKey(dayKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return "";
  const at = new Date(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return "";

  // getUTCDay: zondag is 0. We willen maandag als begin, dus zondag telt als
  // zes dagen ná maandag — niet als nul.
  const weekday = at.getUTCDay();
  const backToMonday = weekday === 0 ? 6 : weekday - 1;
  at.setUTCDate(at.getUTCDate() - backToMonday);
  return at.toISOString().slice(0, 10);
}

/** De maand waar deze brokerdag in valt, als `YYYY-MM`. */
export function monthKeyFromDayKey(dayKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return "";
  return dayKey.slice(0, 7);
}

function foldBucket(bucket: FoldableCandle[], complete: boolean): FoldedCandle {
  const first = bucket[0];
  const last = bucket[bucket.length - 1];

  let high = first.high;
  let low = first.low;
  let volume = 0;
  let sawVolume = false;

  for (const c of bucket) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
    if (typeof c.volume === "number" && Number.isFinite(c.volume)) {
      volume += c.volume;
      sawVolume = true;
    }
  }

  return {
    // De tijdstempel is die van de eerste dag: het begin van de periode, wat
    // elke chart-bibliotheek verwacht.
    time: first.time,
    open: first.open,
    high,
    low,
    // De slotkoers komt van de laatste dag, niet de hoogste close. Dat klinkt
    // vanzelfsprekend tot iemand `Math.max` over de closes pakt omdat dat voor
    // de high ook werkte.
    close: last.close,
    ...(sawVolume ? { volume } : {}),
    sourceCount: bucket.length,
    complete,
  };
}

/**
 * Vouw dagcandles tot grovere candles via een sleutelfunctie.
 *
 * Invoer wordt op tijd gesorteerd voordat er iets gebeurt. Ongesorteerde
 * candles zouden anders de verkeerde open en close opleveren zonder dat er
 * iets zichtbaar misgaat — het ergste soort fout op een chart.
 */
function foldBy(
  candles: readonly FoldableCandle[],
  timeZone: string,
  keyOf: (dayKey: string) => string,
): FoldedCandle[] {
  const usable = candles
    .filter((c) => Number.isFinite(c.time)
      && Number.isFinite(c.open) && Number.isFinite(c.high)
      && Number.isFinite(c.low) && Number.isFinite(c.close))
    .slice()
    .sort((a, b) => a.time - b.time);

  const buckets: { key: string; items: FoldableCandle[] }[] = [];

  for (const candle of usable) {
    const key = keyOf(sessionDayKey(candle.time, timeZone));
    // Een candle met een onleesbare tijd levert een lege sleutel op. Die hoort
    // nergens bij en gaat eruit, in plaats van met een echte periode mee te
    // liften.
    if (!key) continue;

    const open = buckets[buckets.length - 1];
    if (open && open.key === key) open.items.push(candle);
    else buckets.push({ key, items: [candle] });
  }

  return buckets.map((b, i) => foldBucket(b.items, i < buckets.length - 1));
}

/** Dagcandles → weekcandles, op de weekgrens van de broker. */
export function foldToWeekly(
  candles: readonly FoldableCandle[],
  timeZone: string,
): FoldedCandle[] {
  return foldBy(candles, timeZone, weekKeyFromDayKey);
}

/** Dagcandles → maandcandles, op de maandgrens van de broker. */
export function foldToMonthly(
  candles: readonly FoldableCandle[],
  timeZone: string,
): FoldedCandle[] {
  return foldBy(candles, timeZone, monthKeyFromDayKey);
}

/**
 * Timeframes die uit dagcandles gevouwen worden in plaats van opgehaald.
 *
 * Staat hier en niet in `chartTimeframes.ts`, zodat wie daar een knop toevoegt
 * langs de vraag komt waar de candles vandaan moeten komen.
 */
export const FOLDED_FROM_DAILY: Record<string, (c: readonly FoldableCandle[], tz: string) => FoldedCandle[]> = {
  w1: foldToWeekly,
  mn1: foldToMonthly,
};

/**
 * Hoeveel dagcandles er nodig zijn voor ongeveer `want` gevouwen candles.
 *
 * Een weekchart van 200 candles vraagt vier jaar aan dagen. Vraag je er te
 * weinig op, dan komt de chart stilletjes korter terug dan de gebruiker koos.
 * Ruim genomen: vijf handelsdagen per week, 22 per maand, plus een marge voor
 * feestdagen.
 */
export function dailyCandlesNeeded(tfKey: string, want: number): number {
  const perPeriod = tfKey === "w1" ? 5 : tfKey === "mn1" ? 22 : 0;
  // Wordt er niet gevouwen, dan is er niets bij te schatten: vraag precies
  // wat er gevraagd is. De marge hoort bij feestdagen bínnen een periode, en
  // een dagcandle heeft geen binnenkant.
  if (perPeriod === 0) return Math.min(1000, Math.max(1, Math.ceil(want)));
  return Math.min(1000, Math.ceil(want * perPeriod * 1.1));
}

/** Een candle zoals MetaApi hem teruggeeft: tijd als ISO-string. */
export type IsoCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
  volume?: number;
};

/**
 * Vouw candles met een ISO-tijd, en geef ze zo terug.
 *
 * Dit is de heen-en-weer tussen wat MetaApi stuurt en waar hierboven mee
 * gerekend wordt, en het is de plek waar dit stil mis kan gaan: een
 * onleesbare tijd wordt `NaN`, en dan vallen álle candles in dezelfde emmer —
 * één weekcandle over twee jaar, zonder dat er iets fout gaat. Daarom gaan
 * candles met een onleesbare tijd er hier uit, vóór het vouwen.
 */
export function foldIsoCandles(
  candles: readonly IsoCandle[],
  timeZone: string,
  period: "w1" | "mn1",
): IsoCandle[] {
  const foldable: FoldableCandle[] = [];

  for (const c of candles) {
    const ms = Date.parse(c.time);
    if (!Number.isFinite(ms)) continue;
    foldable.push({
      time: Math.floor(ms / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: typeof c.tickVolume === "number" ? c.tickVolume : c.volume,
    });
  }

  const folded = period === "mn1" ? foldToMonthly(foldable, timeZone) : foldToWeekly(foldable, timeZone);

  return folded.map((f) => ({
    time: new Date(f.time * 1000).toISOString(),
    open: f.open,
    high: f.high,
    low: f.low,
    close: f.close,
    ...(typeof f.volume === "number" ? { tickVolume: f.volume } : {}),
  }));
}
