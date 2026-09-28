"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Alles wat onder de chart hangt, als één stapel.
 *
 * ## Wat er mis was
 *
 * De onderkant van het chartscherm bestond uit drie dingen die niets van
 * elkaar wisten:
 *
 * - de squawkbalk, in de flow, als laatste kind van het chartframe;
 * - de execution bars (market en limit), allebei `fixed bottom-0 z-70`,
 *   buiten de flow;
 * - de bottom nav, `fixed` met z-55, waarvoor de shell ruimte reserveert via
 *   `--tos-nav-offset`.
 *
 * Omdat de execution bars zweven reserveerde niemand ruimte voor ze. Ze
 * legden zich dus over de onderste prijslabels van de chart heen. En omdat de
 * markt-bar ná de squawk in de DOM stond maar de limit-bar ervóór, wisselde
 * ook nog de volgorde: de ene keer stond de squawk boven de handelsbalk, de
 * andere keer eronder. Elke combinatie zag er anders uit, en er stonden
 * losse getallen als `3.35rem` in de code om dat te compenseren -- getallen
 * die niet meebewegen zodra een balk van hoogte verandert.
 *
 * ## Hoe het nu werkt
 *
 * Eén container met een vaste volgorde, en die container MEET zichzelf. De
 * gemeten hoogte gaat als `--tos-chart-dock` op `<body>`, en de chart
 * reserveert precies dat. Verandert er een balk van hoogte, komt er een bij,
 * of valt er een weg, dan volgt de reservering vanzelf -- er is geen getal
 * meer om bij te werken.
 *
 * De volgorde is van boven naar beneden: squawk, PnL, execution. Dat is geen
 * smaak: de squawk is achtergrondinformatie, de PnL-balk is de stand van je
 * positie, en de handelsbalk is de knop waar je op drukt. Die hoort het
 * dichtst bij je duim, zoals in MT5.
 *
 * ## De veilige zone zit hier, en nergens anders
 *
 * `env(safe-area-inset-bottom)` staat op de dock en niet op de losse balken.
 * Stond het op elke balk, dan telde het dubbel zodra er twee tegelijk staan
 * -- en dan zweeft de onderste balk boven de rand in plaats van erop.
 */

/** Waar de gemeten hoogte terechtkomt. Eén naam, zodat CSS hem kan lezen. */
export const DOCK_HOOGTE_VAR = "--tos-chart-dock";

export function ChartBottomDock({
  squawk,
  pnl,
  execution,
  /** In beeldvullende stand hangt de dock in de flow onder de chart; daar is
   *  geen bottom nav om overheen te liggen, en zweven zou de chart juist
   *  afsnijden. */
  inFlow = false,
  className = "",
}: {
  squawk?: React.ReactNode;
  pnl?: React.ReactNode;
  execution?: React.ReactNode;
  inFlow?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const leeg = !squawk && !pnl && !execution;

  useLayoutEffect(() => {
    const el = ref.current;
    // Op <html> en niet op <body>: `--tos-chart-bottom` staat in globals.css
    // op :root en leest deze waarde. Een custom property wordt berekend op het
    // element waar hij gedeclareerd is, dus met de hoogte op <body> zou :root
    // de 0 uit zijn eigen regel inbakken en zou de reservering nooit meebewegen.
    const root = document.documentElement;
    if (!el || leeg) {
      root.style.setProperty(DOCK_HOOGTE_VAR, "0px");
      return;
    }
    // In de flow reserveert de chart al ruimte doordat de dock een gewoon
    // kind van dezelfde kolom is. Zou hij dan ook nog gemeten worden, dan
    // telde dezelfde hoogte twee keer.
    if (inFlow) {
      root.style.setProperty(DOCK_HOOGTE_VAR, "0px");
      return;
    }
    const meet = () => {
      const h = el.getBoundingClientRect().height;
      root.style.setProperty(DOCK_HOOGTE_VAR, `${Math.round(h)}px`);
    };
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [leeg, inFlow]);

  // Bij het verlaten van de chart moet de reservering weg, anders houdt elke
  // andere pagina onderaan een strook leegte over.
  useEffect(
    () => () => {
      document.documentElement.style.setProperty(DOCK_HOOGTE_VAR, "0px");
    },
    [],
  );

  if (leeg) return null;

  return (
    <div
      ref={ref}
      data-chart-dock=""
      className={
        inFlow
          ? `shrink-0 ${className}`
          : `pointer-events-none fixed inset-x-0 bottom-0 z-[70] ${className}`
      }
      style={
        inFlow
          ? undefined
          : { paddingBottom: "env(safe-area-inset-bottom, 0px)" }
      }
    >
      {squawk ? <div className="pointer-events-auto">{squawk}</div> : null}
      {pnl ? <div className="pointer-events-auto">{pnl}</div> : null}
      {execution ? <div className="pointer-events-auto">{execution}</div> : null}
    </div>
  );
}
