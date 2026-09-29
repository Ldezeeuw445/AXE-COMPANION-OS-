/**
 * Secret used to sign/verify short-lived chart session JWTs.
 *
 * Prefer CHART_SESSION_JWT_SECRET (must match Cloudflare chart-edge when
 * that worker is in use). Fall back to a stable derivation so same-origin
 * /ws/chart still works when the dedicated secret was never set — that is
 * the usual reason the chart stuck on SSE.
 */

export type ChartSecretSource = "env" | "derived" | "missing";

export function getChartSessionSecret(): { secret: string; source: ChartSecretSource } {
  const explicit = (process.env.CHART_SESSION_JWT_SECRET ?? "").trim();
  if (explicit) return { secret: explicit, source: "env" };

  const material =
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim() ||
    (process.env.METAAPI_TOKEN ?? process.env.AXE_METAAPI_TOKEN ?? "").trim();
  if (material) return { secret: `axe-chart:${material}`, source: "derived" };

  return { secret: "", source: "missing" };
}

export function getExplicitChartWsUrl(): string {
  return (process.env.CHART_WS_URL ?? process.env.NEXT_PUBLIC_CHART_WS_URL ?? "").trim();
}

export const DEFAULT_CLOUDFLARE_CHART_WS_URL = "wss://chart.axecompanion.com/ws/chart";
