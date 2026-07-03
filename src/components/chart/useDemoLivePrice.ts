"use client";

/**
 * Lightweight demo tick stream — animates last price so PnL and pending
 * fills feel alive without MetaAPI / WebSocket (demo accounts only).
 */

import { useEffect, useRef, useState } from "react";

function tickMagnitude(symbol: string, basePrice: number): number {
  const s = symbol.toUpperCase();
  if (s.includes("XAU")) return 0.08;
  if (s.includes("BTC")) return basePrice * 0.00008;
  if (s.includes("JPY")) return 0.012;
  if (s.length === 6) return 0.00008;
  if (basePrice > 1000) return basePrice * 0.00005;
  return basePrice * 0.0002;
}

export function useDemoLivePrice(
  enabled: boolean,
  symbol: string,
  seedPrice: number | null | undefined,
): number | null {
  const [price, setPrice] = useState<number | null>(seedPrice ?? null);
  const ref = useRef(seedPrice ?? null);

  useEffect(() => {
    ref.current = seedPrice ?? null;
    setPrice(seedPrice ?? null);
  }, [seedPrice, symbol]);

  useEffect(() => {
    if (!enabled || seedPrice == null || !Number.isFinite(seedPrice)) return;
    const mag = tickMagnitude(symbol, seedPrice);
    const id = window.setInterval(() => {
      const cur = ref.current ?? seedPrice;
      const delta = (Math.random() - 0.5) * 2 * mag;
      const next = Math.max(cur * 0.5, cur + delta);
      ref.current = next;
      setPrice(next);
    }, 1200);
    return () => window.clearInterval(id);
  }, [enabled, seedPrice, symbol]);

  return price;
}
