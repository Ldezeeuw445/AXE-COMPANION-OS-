export type RuntimeTruthState = "live" | "degraded" | "warming" | "unavailable" | "inactive";

export function ageMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Date.now() - t;
}

export function isFreshIso(iso: string | null | undefined, maxAgeMs: number): boolean {
  const age = ageMs(iso);
  return age != null && age >= 0 && age <= maxAgeMs;
}

export function runtimeLabel(state: RuntimeTruthState): string {
  switch (state) {
    case "live":
      return "Live";
    case "degraded":
      return "Degraded";
    case "warming":
      return "Warming";
    case "unavailable":
      return "Unavailable";
    case "inactive":
      return "Inactive";
  }
}

export function runtimeSeverity(state: RuntimeTruthState): "fresh" | "degraded" | "blocking" | "inactive" {
  if (state === "live") return "fresh";
  if (state === "unavailable") return "blocking";
  if (state === "inactive") return "inactive";
  return "degraded";
}

export function canonicalBrokerPrice(input: {
  lastPrice?: number | null;
  lastBid?: number | null;
  lastAsk?: number | null;
  lastCandleClose?: number | null;
}): number | null {
  if (input.lastPrice != null && Number.isFinite(input.lastPrice)) return Number(input.lastPrice);
  if (input.lastBid != null && input.lastAsk != null && Number.isFinite(input.lastBid) && Number.isFinite(input.lastAsk)) {
    return (Number(input.lastBid) + Number(input.lastAsk)) / 2;
  }
  if (input.lastCandleClose != null && Number.isFinite(input.lastCandleClose)) return Number(input.lastCandleClose);
  return null;
}

export function brokerPricingState(input: {
  status?: string | null;
  updatedAt?: string | null;
  lastTickAt?: string | null;
  lastCandleAt?: string | null;
  maxFreshMs?: number;
}): RuntimeTruthState {
  const status = String(input.status ?? "").toLowerCase();
  if (status === "error" || status === "offline" || status === "failed") return "unavailable";
  const maxFreshMs = input.maxFreshMs ?? 45_000;
  if (isFreshIso(input.lastTickAt, maxFreshMs)) return "live";
  if (isFreshIso(input.lastCandleAt, maxFreshMs) || isFreshIso(input.updatedAt, maxFreshMs)) return "degraded";
  if (input.updatedAt || input.lastCandleAt || input.lastTickAt) return "degraded";
  return "warming";
}

