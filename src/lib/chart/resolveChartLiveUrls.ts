import {
  DEFAULT_CLOUDFLARE_CHART_WS_URL,
  type ChartSecretSource,
} from "./chartSessionSecret";

export type ChartLiveUrlReason = "same_origin" | "cloudflare" | "derived" | "none";

export type ChartLiveUrls = {
  wsUrl: string | null;
  fallbackWsUrl: string | null;
  reason: ChartLiveUrlReason;
};

/**
 * Prefer same-origin `/ws/chart`. Cloudflare is an optional second hop.
 * Returns no URL only when neither path exists.
 */
export function resolveChartLiveUrls(input: {
  sameOrigin: string | null;
  explicit: string;
  secretSource: ChartSecretSource;
}): ChartLiveUrls {
  const cloudflareFallback =
    input.secretSource === "env" ? input.explicit || DEFAULT_CLOUDFLARE_CHART_WS_URL : input.explicit;
  const wsUrl = input.sameOrigin || cloudflareFallback || null;
  const fallbackWsUrl =
    cloudflareFallback && wsUrl && cloudflareFallback.replace(/\/$/, "") !== wsUrl.replace(/\/$/, "")
      ? cloudflareFallback
      : null;
  const reason: ChartLiveUrlReason = !wsUrl
    ? "none"
    : input.sameOrigin
      ? "same_origin"
      : input.secretSource === "env"
        ? "cloudflare"
        : "derived";
  return { wsUrl, fallbackWsUrl, reason };
}
