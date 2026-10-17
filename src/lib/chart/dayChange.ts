/**
 * De dagverandering, zoals MT5 hem naast bid en ask zet.
 *
 * ## Waarom dit berekend wordt en niet opgehaald
 *
 * De live-stroom levert bid, ask en mid -- geen dagpercentage. Dat staat ook
 * nergens anders in deze app. Het enige wat we hebben zijn de candles die al
 * op het scherm staan, en daar is het uit af te leiden.
 *
 * ## Welke twee getallen
 *
 * MT5 rekent de dagverandering tegen de SLOTKOERS VAN GISTEREN, niet tegen de
 * opening van vandaag. Dat verschil is niet klein: bij een gap tussen sessies
 * verdwijnt precies het stuk beweging dat de dag interessant maakte. Dus:
 * laatste prijs tegen de slotkoers van de vorige handelsdag.
 *
 * ## Waarom null een normaal antwoord is
 *
 * Op een D1- of W1-chart, of vlak na het laden met te weinig historie, is er
 * geen vorige dag in beeld. Dan is er geen percentage, en dan hoort er niets
 * te staan. Een 0,00% tonen zou een rustige dag suggereren terwijl we het
 * simpelweg niet weten -- en dat is het soort stilte waar in deze app geen
 * plek voor is.
 */

export type DagCandle = { time: string; close: number };

/** De kalenderdag in UTC, als `YYYY-MM-DD`. */
function dagSleutel(tijd: string): string | null {
  const d = new Date(tijd);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * De slotkoers van de laatste dag vóór die van de nieuwste candle.
 * Null als die dag niet in de reeks zit.
 */
export function vorigeSlotkoers(candles: readonly DagCandle[]): number | null {
  if (candles.length < 2) return null;
  const laatste = candles[candles.length - 1];
  const vandaag = dagSleutel(laatste.time);
  if (!vandaag) return null;

  // Terug lopen tot de eerste candle van een ANDERE dag: dat is de slotkoers
  // van de vorige handelsdag. Weekenden slaan we zo vanzelf over, want een
  // markt die dicht was levert geen candles.
  for (let i = candles.length - 2; i >= 0; i--) {
    const d = dagSleutel(candles[i].time);
    if (!d) continue;
    if (d !== vandaag) {
      const c = candles[i].close;
      return Number.isFinite(c) && c !== 0 ? c : null;
    }
  }
  return null;
}

/**
 * Het dagpercentage, of null als het niet vast te stellen is.
 *
 * @param prijs de laatste prijs; laat leeg om de slotkoers van de nieuwste
 *   candle te gebruiken (bijvoorbeeld als er nog geen tick binnen is).
 */
export function dagVeranderingPct(
  candles: readonly DagCandle[],
  prijs?: number | null,
): number | null {
  const basis = vorigeSlotkoers(candles);
  if (basis == null) return null;
  const nu =
    prijs != null && Number.isFinite(prijs)
      ? prijs
      : candles[candles.length - 1]?.close;
  if (nu == null || !Number.isFinite(nu)) return null;
  return ((nu - basis) / basis) * 100;
}

/** `-3.24%`, met teken, zoals MT5 hem toont. Null blijft null. */
export function dagVeranderingTekst(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  const teken = pct > 0 ? "+" : "";
  return `${teken}${pct.toFixed(2)}%`;
}
