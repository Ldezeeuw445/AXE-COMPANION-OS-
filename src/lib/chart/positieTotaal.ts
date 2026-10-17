/**
 * De stand van je open posities op dit symbool, als één regel.
 *
 * ## Waarom dit een eigen bestand is
 *
 * Optellen lijkt te simpel voor een module, tot je kijkt wat er opgeteld
 * wordt. Een broker levert `profit` soms niet mee (een verse positie, een
 * trage stream), en `0` en `onbekend` zijn dan twee heel verschillende
 * dingen: het eerste zegt "je staat vlak", het tweede "ik weet het niet".
 * Ze door elkaar halen levert een balk op die rustig €0,00 meldt terwijl er
 * geld op tafel ligt.
 *
 * Dus: alleen tellen wat er is, en apart bijhouden of er iets ontbrak. De
 * balk kan dan een streepje tonen in plaats van een getal dat niet klopt.
 */

export type PositieRij = {
  side: string;
  volume: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  profit: number | null;
};

export type PositieTotaal = {
  /** Hoeveel posities er open staan op dit symbool. */
  aantal: number;
  /** Opgeteld resultaat, of null als geen enkele positie het meldde. */
  winst: number | null;
  /** Waar is er nog geen SL / TP? Dat bepaalt of "alles" iets te doen heeft. */
  zonderSl: number;
  zonderTp: number;
  /** Totale omvang, voor de regel links. */
  volume: number;
  /** Miste er resultaat bij een of meer posities? Dan is `winst` onvolledig. */
  onvolledig: boolean;
};

export function positieTotaal(rijen: readonly PositieRij[]): PositieTotaal {
  let winst: number | null = null;
  let onvolledig = false;
  let zonderSl = 0;
  let zonderTp = 0;
  let volume = 0;

  for (const r of rijen) {
    if (typeof r.profit === "number" && Number.isFinite(r.profit)) {
      winst = (winst ?? 0) + r.profit;
    } else {
      onvolledig = true;
    }
    if (r.stopLoss == null) zonderSl += 1;
    if (r.takeProfit == null) zonderTp += 1;
    if (Number.isFinite(r.volume)) volume += r.volume;
  }

  return { aantal: rijen.length, winst, zonderSl, zonderTp, volume, onvolledig };
}

/** `+12.40` / `-3.05`, met teken. Null blijft een streepje voor de beller. */
export function winstTekst(winst: number | null): string | null {
  if (winst == null || !Number.isFinite(winst)) return null;
  return `${winst > 0 ? "+" : ""}${winst.toFixed(2)}`;
}

/**
 * De prijs waarop een SL of TP komt te liggen bij een percentage van de
 * inleg, gerekend vanaf de instapprijs.
 *
 * Richting telt: bij een verkoop ligt een stop BOVEN de instap en een doel
 * eronder. Dat omdraaien is de klassieke fout die een stop in een doel
 * verandert -- vandaar dat het hier één keer staat en niet bij elke knop.
 */
export function prijsOpAfstand(
  entry: number,
  procent: number,
  side: string,
  soort: "sl" | "tp",
): number | null {
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(procent)) return null;
  const koop = side.toLowerCase().startsWith("b");
  const omhoog = soort === "tp" ? koop : !koop;
  const stap = entry * (procent / 100);
  return omhoog ? entry + stap : entry - stap;
}
