import type { SquawkStation, SquawkTier } from "@/lib/squawk/streams";

/** Session-aware rotation order — core first, then session/context by market hours (UTC). */
export function buildSquawkRotation(
  stations: SquawkStation[],
  now = new Date(),
): SquawkStation[] {
  if (stations.length <= 1) return stations;

  const hourUtc = now.getUTCHours();
  const usCash = hourUtc >= 13 && hourUtc < 21;
  const euCash = hourUtc >= 7 && hourUtc < 16;

  const byTier = (tier: SquawkTier) => stations.filter((s) => s.tier === tier);

  const core = byTier("core");
  const session = byTier("session");
  const context = byTier("context");

  if (usCash) {
    return [...core, ...session, ...context];
  }
  if (euCash) {
    const sky = session.find((s) => s.id === "sky-news");
    const restSession = session.filter((s) => s.id !== "sky-news");
    return [...core, ...(sky ? [sky] : []), ...restSession, ...context];
  }
  return [...core, ...context, ...session];
}

export function tierLabel(tier: SquawkTier): string {
  if (tier === "core") return "Core";
  if (tier === "session") return "Session";
  return "Context";
}
