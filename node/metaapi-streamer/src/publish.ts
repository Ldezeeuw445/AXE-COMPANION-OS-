import type { ChartLiveEvent } from "./types.js";

type PublishConfig = {
  workerUrl: string;
  streamerSecret: string;
};

const MAX_BACKOFF_MS = 15_000;

/**
 * Fire-and-forget publisher to the Cloudflare ChartLiveRoom. Retries with
 * exponential backoff on transient errors. Drops the event after `maxAttempts`
 * to avoid blocking the live stream — better to skip a tick than stall.
 */
export async function publishEvent(
  config: PublishConfig,
  roomKey: string,
  event: ChartLiveEvent,
  maxAttempts = 3,
): Promise<boolean> {
  const url = `${config.workerUrl.replace(/\/$/, "")}/internal/publish`;
  let attempt = 0;
  let backoff = 500;

  while (attempt < maxAttempts) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Streamer-Secret": config.streamerSecret,
        },
        body: JSON.stringify({ roomKey, event }),
      });
      if (res.ok) return true;
      // 4xx rarely improves with retry; bail out.
      if (res.status >= 400 && res.status < 500) return false;
    } catch {
      /* network blip → retry */
    }

    attempt += 1;
    if (attempt >= maxAttempts) return false;
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }
  return false;
}
