import type { NextRequest } from "next/server";

/** Same-origin chart websocket path served by the Next Node process. */
export const CHART_WS_PATH = "/ws/chart";

export function sameOriginChartWsUrl(request: NextRequest): string | null {
  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    ""
  )
    .split(",")[0]
    ?.trim();
  if (!host) return null;
  const forwarded = (request.headers.get("x-forwarded-proto") ?? "").split(",")[0]?.trim();
  const proto = forwarded || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const wsProto = proto === "http" ? "ws" : "wss";
  return `${wsProto}://${host}${CHART_WS_PATH}`;
}
