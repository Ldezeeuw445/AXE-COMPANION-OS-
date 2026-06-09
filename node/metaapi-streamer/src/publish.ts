import type { ChartLiveEvent } from "./types.js";

type PublishConfig = {
  workerUrl: string;
  streamerSecret: string;
};

/* ── Concurrency limiter ─────────────────────────────────────────── */

const MAX_INFLIGHT = 40; // max concurrent HTTP requests
let inflight = 0;

/**
 * Publisher to the Cloudflare ChartLiveRoom with bounded concurrency.
 * Drops events when inflight limit is reached — better to skip a tick
 * than OOM the process.
 */
export async function publishEvent(
  config: PublishConfig,
  roomKey: string,
  event: ChartLiveEvent,
): Promise<boolean> {
  // Shed load when too many requests are in flight
  if (inflight >= MAX_INFLIGHT) return false;

  inflight++;
  try {
    const url = `${config.workerUrl.replace(/\/$/, "")}/internal/publish`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Streamer-Secret": config.streamerSecret,
      },
      body: JSON.stringify({ roomKey, event }),
    });
    // Consume body to free memory
    if (!res.ok) await res.text();
    return res.ok;
  } catch {
    return false;
  } finally {
    inflight--;
  }
}

/** Current inflight count (for diagnostics). */
export function getInflightCount(): number {
  return inflight;
}
