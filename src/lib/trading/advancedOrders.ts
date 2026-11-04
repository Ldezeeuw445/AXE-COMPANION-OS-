/**
 * Trailing stop en stop-limit: de twee ordervormen die de app niet kende.
 *
 * Punt 15 van de rij. MetaApi ondersteunt ze allebei, de app kende alleen
 * market, limit en stop.
 *
 * Beide falen op een manier die de trader niet ziet.
 *
 * **Stop-limit.** MT5 plaatst bij het raken van de stopprijs een gewone
 * limietorder op de limietprijs. Een koop-limiet hoort onder de markt, dus
 * eist MT5 dat de limietprijs *onder* de stopprijs ligt bij een koop — en
 * boven bij een verkoop. Draai je dat om, dan weigert de broker de order. Dat
 * is nog het vriendelijke geval. Het onvriendelijke is de limiet die wél de
 * goede kant op staat maar zo ver weg dat hij na het triggeren nooit gevuld
 * wordt: de stop is geraakt, de order is weg uit het boek, en de trader denkt
 * dat hij in de markt zit terwijl er niets ligt.
 *
 * **Trailing stop.** Dit is wat een trader aanzet als hij weg moet, en dat is
 * precies het moment waarop niemand meekijkt. De enige regel die telt is dat
 * een trailing stop **nooit de verkeerde kant op beweegt**. Beweegt hij mee
 * omlaag met een long, dan is het geen trailing stop maar een stop die zich
 * laat wegduwen, en dan heeft de trader zijn bescherming weggegeven op het
 * moment dat hij hem nodig had.
 *
 * Afhankelijkheidsvrij, zodat `scripts/verify-advanced-orders.mjs` het
 * rechtstreeks kan uitoefenen.
 */

export type OrderSide = "buy" | "sell";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/* ── Stop-limit ──────────────────────────────────────────────────────── */

export type StopLimitInput = {
  side: OrderSide;
  /** De prijs die de order laat afgaan. */
  stopPrice: number;
  /** De prijs van de limietorder die daarna in het boek komt. */
  limitPrice: number;
  /** De huidige markt, om te zien of de stop aan de goede kant staat. */
  market: number | null | undefined;
};

export type StopLimitVerdict =
  | { ok: false; reason: StopLimitRefusal }
  | { ok: true; warning: StopLimitWarning | null; gap: number };

export type StopLimitRefusal =
  | "onleesbare_prijzen"
  | "stop_aan_de_verkeerde_kant_van_de_markt"
  | "limiet_aan_de_verkeerde_kant_van_de_stop"
  | "limiet_gelijk_aan_de_stop";

export type StopLimitWarning = "gat_tussen_stop_en_limiet_is_groot";

/**
 * Hoe ver limiet en stop uit elkaar mogen staan voor het een waarschuwing
 * wordt, als deel van de stopprijs.
 *
 * Een half procent is al veel: de order triggert en wacht dan op een
 * terugval van een half procent die er niet hoeft te komen. Dat is een
 * geldige strategie — de retest kopen — maar het is wat anders dan wat de
 * meeste mensen denken dat ze instellen, dus het hoort gezegd te worden.
 */
export const STOP_LIMIT_GAP_WARN_PCT = 0.5;

export function validateStopLimit(input: StopLimitInput): StopLimitVerdict {
  const { side, stopPrice, limitPrice, market } = input;
  if (!finite(stopPrice) || !finite(limitPrice) || stopPrice <= 0 || limitPrice <= 0) {
    return { ok: false, reason: "onleesbare_prijzen" };
  }

  // Een stop koopt hoger of verkoopt lager dan de markt; staat hij aan de
  // andere kant, dan is het geen stop maar een limiet en gaat hij meteen af.
  if (finite(market) && market > 0) {
    const stopFout = side === "buy" ? stopPrice <= market : stopPrice >= market;
    if (stopFout) return { ok: false, reason: "stop_aan_de_verkeerde_kant_van_de_markt" };
  }

  if (limitPrice === stopPrice) return { ok: false, reason: "limiet_gelijk_aan_de_stop" };

  // De kern: na het triggeren komt er een gewone limietorder in het boek, en
  // een koop-limiet hoort onder de markt. MT5 weigert het omgekeerde.
  const limietFout = side === "buy" ? limitPrice > stopPrice : limitPrice < stopPrice;
  if (limietFout) return { ok: false, reason: "limiet_aan_de_verkeerde_kant_van_de_stop" };

  const gap = Math.abs(stopPrice - limitPrice);
  const gapPct = (gap / stopPrice) * 100;
  return {
    ok: true,
    gap,
    warning: gapPct > STOP_LIMIT_GAP_WARN_PCT ? "gat_tussen_stop_en_limiet_is_groot" : null,
  };
}

/* ── Trailing stop ───────────────────────────────────────────────────── */

export type TrailingInput = {
  side: OrderSide;
  /** De prijs waar de positie nu tegen gewaardeerd wordt. */
  price: number;
  /** De stop zoals hij nu staat. Null als er nog geen stop is. */
  currentStop: number | null | undefined;
  /** Hoe ver de stop achter de prijs aan loopt, in prijseenheden. */
  distance: number;
  /**
   * De kleinste afstand die de broker toestaat, in prijseenheden.
   *
   * MT5 noemt dit `stopsLevel`. Een stop dichterbij dan dat wordt geweigerd,
   * en dan loopt de trailing stop niet mee zonder dat er iets op het scherm
   * verandert.
   */
  minDistance?: number | null;
};

export type TrailingVerdict =
  | { moved: false; reason: TrailingHold; stop: number | null }
  | { moved: true; stop: number };

export type TrailingHold =
  | "onleesbare_invoer"
  | "afstand_te_klein_voor_de_broker"
  | "prijs_is_niet_ver_genoeg_gelopen";

/**
 * Waar de trailing stop heen zou moeten, gegeven de prijs van nu.
 *
 * Geeft alleen een nieuwe stop terug als die **beter** is dan de huidige:
 * hoger voor een long, lager voor een short. Dat is de hele functie. Een
 * trailing stop die ook de andere kant op mag bewegen is een stop die zich
 * laat wegduwen, en die neemt de bescherming weg op het moment dat de markt
 * tegen de positie in loopt — precies waarvoor hij aan stond.
 */
export function trailingStopUpdate(input: TrailingInput): TrailingVerdict {
  const { side, price, currentStop, distance } = input;
  const minDistance = input.minDistance;

  if (!finite(price) || price <= 0 || !finite(distance) || distance <= 0) {
    return { moved: false, reason: "onleesbare_invoer", stop: finite(currentStop) ? currentStop : null };
  }
  if (finite(minDistance) && minDistance > 0 && distance < minDistance) {
    return {
      moved: false,
      reason: "afstand_te_klein_voor_de_broker",
      stop: finite(currentStop) ? currentStop : null,
    };
  }

  const voorstel = side === "buy" ? price - distance : price + distance;

  // Geen stop? Dan is elke stop beter dan geen stop.
  if (!finite(currentStop)) return { moved: true, stop: voorstel };

  const beter = side === "buy" ? voorstel > currentStop : voorstel < currentStop;
  if (!beter) {
    return { moved: false, reason: "prijs_is_niet_ver_genoeg_gelopen", stop: currentStop };
  }
  return { moved: true, stop: voorstel };
}

/**
 * Loop een reeks prijzen door en geef waar de stop uiteindelijk staat.
 *
 * Hiermee is de eigenschap die ertoe doet in één keer na te meten: over een
 * willekeurige reeks mag de stop nooit de verkeerde kant op gaan. Eén losse
 * aanroep bewijst dat niet — een fout die pas bij de derde stap omslaat
 * glipt er dan doorheen.
 */
export function trailStopOverPrices(
  side: OrderSide,
  prices: readonly number[],
  distance: number,
  startStop: number | null = null,
  minDistance: number | null = null,
): number | null {
  let stop = startStop;
  for (const price of prices) {
    const verdict = trailingStopUpdate({ side, price, currentStop: stop, distance, minDistance });
    if (verdict.moved) stop = verdict.stop;
  }
  return stop;
}
