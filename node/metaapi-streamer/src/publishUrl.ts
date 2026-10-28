/**
 * Keep in sync with src/lib/chart/streamerPublishUrl.ts.
 * The streamer is built as its own package, so it cannot import from the Next app.
 */

const VPS_PATH = "/api/internal/chart-publish";
const WORKER_PATH = "/internal/publish";

export function resolveStreamerPublishUrl(workerUrl: string): string {
  const trimmed = workerUrl.trim();
  if (!trimmed) return VPS_PATH;

  let base = trimmed.replace(/\/$/, "");
  try {
    const u = new URL(base);
    base = `${u.origin}${u.pathname}`.replace(/\/$/, "");
  } catch {
    /* keep as-is */
  }

  if (base.endsWith(VPS_PATH) || base.endsWith(WORKER_PATH)) return base;

  try {
    const host = new URL(base).hostname.toLowerCase();
    if (host.endsWith(".workers.dev") || host.startsWith("chart.")) {
      return `${base}${WORKER_PATH}`;
    }
  } catch {
    /* fall through to VPS */
  }

  return `${base}${VPS_PATH}`;
}

export function accountWildcardRoomKey(userId: string, accountId: string): string {
  return `${userId}|${accountId}|*`;
}
