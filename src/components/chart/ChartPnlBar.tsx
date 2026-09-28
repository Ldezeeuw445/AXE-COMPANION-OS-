"use client";

import { useState } from "react";
import { positieTotaal, winstTekst, type PositieRij } from "@/lib/chart/positieTotaal";

/**
 * De dunne balk met de stand van je open posities.
 *
 * ## Waarom hij dun is
 *
 * Hij staat er zodra je een positie hebt en verdwijnt zodra je er geen meer
 * hebt -- dus hij concurreert altijd met de chart om ruimte. Eén regel: wat
 * er open staat, wat het doet, en de twee dingen die je er op dat moment mee
 * wilt. Alles wat je daarna wilt weten staat op de Trade-tab.
 *
 * ## Waarom SL en TP op ALLES
 *
 * Als het tegen je in gaat wil je niet drie posities los aanklikken. "Zet een
 * stop op alles" is precies de handeling waarvoor je je telefoon pakt. Het
 * percentage staat ernaast en is aan te passen, want 1% op goud is iets heel
 * anders dan 1% op een index.
 *
 * ## Wat de knoppen NIET doen
 *
 * Ze sturen niets uit zichzelf. Ze rekenen de prijzen uit en geven ze door;
 * de bevestiging hoort op dezelfde plek te staan als bij elke andere order.
 * Een knop die stilletjes drie stops verzet bij een misklik is erger dan een
 * knop die één keer vraagt.
 */

/** Wat "alles" standaard betekent. Aan te passen in de balk zelf. */
const STANDAARD_PROCENT = 1;

export function ChartPnlBar({
  posities,
  valuta = "$",
  onSlAlles,
  onTpAlles,
  onOpenen,
}: {
  posities: readonly PositieRij[];
  valuta?: string;
  /** Krijgt het gekozen percentage; de pagina rekent en bevestigt. */
  onSlAlles?: (procent: number) => void;
  onTpAlles?: (procent: number) => void;
  /** Tik op de regel zelf: naar het volledige overzicht. */
  onOpenen?: () => void;
}) {
  const [procent, setProcent] = useState(STANDAARD_PROCENT);
  const t = positieTotaal(posities);
  if (t.aantal === 0) return null;

  const tekst = winstTekst(t.winst);
  const groen = (t.winst ?? 0) >= 0;

  return (
    <div
      className="flex h-8 shrink-0 items-center gap-2 border-t border-white/[0.06] px-3"
      style={{ background: "linear-gradient(180deg, #0c0d11 0%, #070709 100%)" }}
    >
      <button
        type="button"
        onClick={onOpenen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-70"
        aria-label="Open positions"
      >
        <span className="shrink-0 rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[9px] font-bold text-white/70">
          {t.aantal}
        </span>
        <span className="shrink-0 font-mono text-[9.5px] text-white/40">
          {t.volume.toFixed(2)}
        </span>
        {/* Het bedrag is het enige gekleurde op deze balk -- kleur zit in de
            cijfers, niet in een vlak (wet 10). Onbekend is een streepje: een
            0,00 tonen terwijl de broker niets meldde leest als "je staat
            vlak" terwijl er geld op tafel ligt. */}
        <span
          className={`truncate font-mono text-[12px] font-bold tabular-nums ${
            tekst == null ? "text-white/30" : groen ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {tekst == null ? "—" : `${tekst} ${valuta}`}
          {t.onvolledig && tekst != null ? (
            <span className="ml-1 text-[9px] font-normal text-white/30">deels</span>
          ) : null}
        </span>
      </button>

      {/* Het percentage dat "alles" betekent. Een select en geen vrij veld:
          op een telefoon is tikken sneller dan typen, en de stappen die je
          werkelijk gebruikt zijn op één hand te tellen. */}
      <label className="sr-only" htmlFor="axe-pnl-pct">Percentage</label>
      <select
        id="axe-pnl-pct"
        value={procent}
        onChange={(e) => setProcent(Number(e.target.value))}
        className="shrink-0 appearance-none rounded border border-white/[0.10] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/75 outline-none"
      >
        {[0.5, 1, 1.5, 2, 3, 5].map((p) => (
          <option key={p} value={p}>{p}%</option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => onSlAlles?.(procent)}
        disabled={!onSlAlles}
        title={t.zonderSl > 0 ? `${t.zonderSl} zonder stop` : "Verzet elke stop"}
        className="shrink-0 rounded border border-rose-400/30 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-300 active:scale-95 disabled:opacity-40"
      >
        SL all
      </button>
      <button
        type="button"
        onClick={() => onTpAlles?.(procent)}
        disabled={!onTpAlles}
        title={t.zonderTp > 0 ? `${t.zonderTp} zonder doel` : "Verzet elk doel"}
        className="shrink-0 rounded border border-emerald-400/30 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 active:scale-95 disabled:opacity-40"
      >
        TP all
      </button>
    </div>
  );
}
