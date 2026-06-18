import type { ChartLiveEvent } from "./types.js";

type PublishConfig = {
  workerUrl: string;
  streamerSecret: string;
};

/* ── Concurrency limiter ─────────────────────────────────────────── */

const MAX_INFLIGHT = 40; // max concurrent HTTP requests
let inflight = 0;
const pendingSlots: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (inflight < MAX_INFLIGHT) {
    inflight++;
    return;
  }

  await new Promise<void>((resolve) => {
    pendingSlots.push(resolve);
  });
}

function releaseSlot(): void {
  const next = pendingSlots.shift();
  if (next) {
    next();
    return;
  }

  inflight--;
}

/**
 * Publisher to the Cloudflare ChartLiveRoom with bounded concurrency.
 * Queues events when the inflight limit is reached so fan-out bursts do not
 * silently shed chart updates.
 */
export async function publishEvent(
  config: PublishConfig,
  roomKey: string,
  event: ChartLiveEvent,
): Promise<boolean> {
  await acquireSlot();
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
    releaseSlot();
  }
}

/** Current inflight count (for diagnostics). */
export function getInflightCount(): number {
  return inflight;
}
