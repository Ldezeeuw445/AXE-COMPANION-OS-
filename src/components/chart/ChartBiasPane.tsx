"use client";

import { useEffect, useRef, useState } from "react";

import { CHART_TF_OPTIONS } from "@/lib/broker/chartTimeframes";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";

import { ChartCanvas } from "./ChartCanvas";

/**
 * De bovenste van twee charts: dezelfde pair, een grovere timeframe.
 *
 * Punt 16 van de rij. Dit is de richting; de chart eronder is het moment.
 *
 * Haalt zijn eigen candles op, zodat ChartScreen er maar één regel voor
 * hoeft te hebben. Faalt dat, dan verdwijnt het paneel en blijft de
 * hoofdchart staan — een blik op de richting is nooit een reden om de chart
 * waarop gehandeld wordt in de weg te zitten.
 */
type Props = {
  accountId: string | null | undefined;
  brokerSymbol: string;
  /** De timeframe van de chart hieronder. De bias volgt daaruit. */
  executionKey: string;
  height: number;
  /** Achtergrond van het chart-thema, zodat de twee panelen één geheel zijn. */
  background: string;
  isDark: boolean;
};

export function ChartBiasPane({
  accountId,
  brokerSymbol,
  executionKey,
  height,
  background,
  isDark,
}: Props) {
  const [candles, setCandles] = useState<MetaApiCandle[]>([]);
  const [biasKey, setBiasKey] = useState<string | null>(null);
  const [state, setState] = useState<"laden" | "klaar" | "leeg">("laden");
  // Houdt bij welke aanvraag de laatste is. Zonder dit kan een traag antwoord
  // op een oude timeframe een nieuw antwoord overschrijven, en dan staat er
  // een bias-chart boven die bij een andere chart hoort — het ergste wat dit
  // paneel kan doen, want hij ziet er volkomen normaal uit.
  const aanvraagRef = useRef(0);

  useEffect(() => {
    if (!accountId || !brokerSymbol) {
      const id = requestAnimationFrame(() => setState("leeg"));
      return () => cancelAnimationFrame(id);
    }

    const mijn = ++aanvraagRef.current;
    const start = requestAnimationFrame(() => setState("laden"));

    const params = new URLSearchParams({
      account: accountId,
      symbol: brokerSymbol,
      tf: executionKey,
    });

    fetch(`/api/chart/bias-candles?${params.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((body: { biasKey?: string | null; candles?: MetaApiCandle[] }) => {
        if (mijn !== aanvraagRef.current) return;
        const rows = Array.isArray(body.candles) ? body.candles : [];
        setCandles(rows);
        setBiasKey(body.biasKey ?? null);
        setState(rows.length > 0 ? "klaar" : "leeg");
      })
      .catch(() => {
        if (mijn !== aanvraagRef.current) return;
        setState("leeg");
      });
    return () => cancelAnimationFrame(start);
  }, [accountId, brokerSymbol, executionKey]);

  // Niets te tonen is niets tonen. Een lege chart boven een volle chart is
  // verwarrender dan één chart.
  if (state === "leeg") return null;

  const label = CHART_TF_OPTIONS.find((t) => t.key === biasKey)?.label ?? biasKey?.toUpperCase() ?? "";

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${isDark ? "border-b border-white/[0.08]" : "border-b border-black/[0.06]"}`}
      style={{ height, background }}
    >
      {state === "klaar" ? (
        <ChartCanvas candles={candles} overlays={[]} symbol={brokerSymbol} navigationLocked />
      ) : null}

      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/55 px-2 py-0.5 backdrop-blur-sm">
        <span className="text-[10px] font-semibold tracking-wide text-white/70">{label}</span>
        <span className="text-[10px] text-white/35">richting</span>
      </div>
    </div>
  );
}
