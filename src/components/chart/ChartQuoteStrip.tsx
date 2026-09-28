"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Bid, ask en dagverandering, naast de verbindingsbadge.
 *
 * ## Wat hier weg moest
 *
 * Onder de pair-dropdown stond het symbool nóg een keer, met de middenprijs
 * ernaast. Het symbool staat al in de dropdown erboven -- twee keer hetzelfde
 * op twee regels, en de regel eronder at chartruimte die niets toevoegde.
 * In plaats daarvan staat er nu wat een handelaar werkelijk nodig heeft en
 * wat er nog niet stond: de twee kanten van de markt, en waar de dag staat.
 *
 * ## Waarom de kleur meebeweegt en niet vaststaat
 *
 * In MT5 kleurt een koers op de RICHTING VAN ZIJN LAATSTE TIK, niet op of hij
 * boven of onder iets ligt. Daarmee zie je zonder te lezen dat er beweging is
 * en welke kant op. Dat gedrag is hier nagedaan met de kleuren van deze app:
 * emerald omhoog, rose omlaag, en daarna dooft hij terug naar neutraal zodat
 * een stilstaande markt er ook stil uitziet.
 *
 * De dagverandering kleurt wél op zijn teken -- dat is geen beweging maar een
 * stand, en die hoort niet te knipperen.
 *
 * ## Geen cijfer verzinnen
 *
 * Ontbreekt bid of ask, of is de dagverandering niet af te leiden (zie
 * dayChange.ts), dan staat er een streepje. Een 0,00% tonen omdat er niets
 * bekend is, leest als een rustige markt in plaats van als ontbrekende data.
 */

/** Hoe lang een tik oplicht voordat hij terugvalt naar neutraal. */
const TIK_MS = 700;

type Richting = "op" | "neer" | "stil";

function useTikRichting(waarde: number | null): Richting {
  const [richting, setRichting] = useState<Richting>("stil");
  const vorige = useRef<number | null>(null);

  useEffect(() => {
    if (waarde == null || !Number.isFinite(waarde)) return;
    const eerder = vorige.current;
    vorige.current = waarde;
    if (eerder == null || eerder === waarde) return;
    setRichting(waarde > eerder ? "op" : "neer");
    const t = setTimeout(() => setRichting("stil"), TIK_MS);
    return () => clearTimeout(t);
  }, [waarde]);

  return richting;
}

const TIK_KLEUR: Record<Richting, string> = {
  op: "text-emerald-300",
  neer: "text-rose-300",
  stil: "text-white/80",
};

function Koers({ label, waarde, tekst }: { label: string; waarde: number | null; tekst: string }) {
  const richting = useTikRichting(waarde);
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1">
      <span className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white/35">
        {label}
      </span>
      <span
        className={`font-mono text-[11px] font-semibold tabular-nums transition-colors duration-200 ${TIK_KLEUR[richting]}`}
      >
        {tekst}
      </span>
    </span>
  );
}

export function ChartQuoteStrip({
  bid,
  ask,
  bidText,
  askText,
  dayPct,
  dayText,
  className = "",
}: {
  bid: number | null;
  ask: number | null;
  bidText: string;
  askText: string;
  dayPct: number | null;
  dayText: string | null;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-baseline gap-2.5 ${className}`} aria-live="off">
      <Koers label="bid" waarde={bid} tekst={bidText} />
      <Koers label="ask" waarde={ask} tekst={askText} />
      <span
        className={`shrink-0 font-mono text-[10px] font-bold tabular-nums ${
          dayText == null
            ? "text-white/30"
            : dayPct != null && dayPct < 0
              ? "text-rose-400"
              : "text-emerald-400"
        }`}
        title="Verandering sinds de slotkoers van de vorige handelsdag"
      >
        {dayText ?? "—"}
      </span>
    </div>
  );
}
