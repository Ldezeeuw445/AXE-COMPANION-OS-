import type { ChartLiveEvent } from "./types.js";

export const PUBLISH_FLUSH_INTERVAL_MS = 400;
export const PUBLISH_CIRCUIT_MS = 10 * 60 * 1000;
export const PUBLISH_BACKOFF_INITIAL_MS = 1_000;
export const PUBLISH_BACKOFF_MAX_MS = 5 * 60 * 1000;

const MAX_INFLIGHT = 40;

export type PublishConfig = {
  workerUrl: string;
  streamerSecret: string;
};

export type PublishLog = (
  level: "error" | "warn" | "info" | "debug",
  msg: string,
  ...rest: unknown[]
) => void;

export type PublishDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  log?: PublishLog;
  autoFlush?: boolean;
  flushIntervalMs?: number;
};

export type PublishStats = {
  failed: number;
  dropped: number;
  inflight: number;
  circuitOpen: boolean;
  backoffMs: number;
};

type PendingPublish = {
  config: PublishConfig;
  roomKey: string;
  event: ChartLiveEvent;
};

function defaultLog(
  level: "error" | "warn" | "info" | "debug",
  msg: string,
  ...rest: unknown[]
): void {
  const prefix = `[streamer ${new Date().toISOString()}] ${level.toUpperCase()}:`;
  const fn = level === "debug" ? console.log : console[level];
  fn(prefix, msg, ...rest);
}

function isCloudflare1027(body: string): boolean {
  if (!/\b1027\b/.test(body)) return false;
  return /cloudflare/i.test(body) || /error code/i.test(body);
}

function classifyPublishResponse(
  status: number,
  body: string,
): "ok" | "circuit" | "backoff" | "fail" {
  if (status >= 200 && status < 300) return "ok";
  if (isCloudflare1027(body)) return "backoff";
  if (status === 401 || status === 403 || status === 503) return "circuit";
  if (status === 429 || status >= 500) return "backoff";
  return "fail";
}

function coalesceKey(roomKey: string, event: ChartLiveEvent): string {
  // Latest tick must not clobber a positions/orders/candle event in the same
  // flush window — both receivers dispatch on event.type.
  return `${roomKey}\0${event.type}`;
}

function publishUrl(workerUrl: string): string {
  return `${workerUrl.replace(/\/$/, "")}/internal/publish`;
}

/**
 * Coalescing publisher with a circuit breaker and exponential backoff.
 *
 * Callers enqueue the latest event per roomKey+type; a 250–500ms flush posts
 * `{ roomKey, event }` to `${WORKER_URL}/internal/publish`, which both the
 * Cloudflare chart-edge worker and the VPS `/internal/publish` (alias of
 * `/api/internal/chart-publish`) accept.
 */
export class ChartPublisher {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly log: PublishLog;
  private readonly autoFlush: boolean;
  private readonly flushIntervalMs: number;

  private readonly pending = new Map<string, PendingPublish>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  private inflight = 0;
  private readonly pendingSlots: Array<() => void> = [];

  private circuitUntil = 0;
  private circuitLogged = false;
  private backoffUntil = 0;
  private backoffMs = PUBLISH_BACKOFF_INITIAL_MS;

  private failed = 0;
  private dropped = 0;

  constructor(deps: PublishDeps = {}) {
    this.fetchFn = deps.fetch ?? fetch;
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.log = deps.log ?? defaultLog;
    this.autoFlush = deps.autoFlush ?? true;
    this.flushIntervalMs = deps.flushIntervalMs ?? PUBLISH_FLUSH_INTERVAL_MS;
  }

  /** Enqueue (or drop if the breaker/backoff is open). Returns false when dropped. */
  publish(config: PublishConfig, roomKey: string, event: ChartLiveEvent): boolean {
    this.refreshCircuitLogFlag();
    if (this.isBlocked()) {
      this.dropped++;
      return false;
    }
    this.pending.set(coalesceKey(roomKey, event), { config, roomKey, event });
    this.ensureTimer();
    return true;
  }

  getInflightCount(): number {
    return this.inflight;
  }

  getStats(): PublishStats {
    const now = this.now();
    return {
      failed: this.failed,
      dropped: this.dropped,
      inflight: this.inflight,
      circuitOpen: now < this.circuitUntil,
      backoffMs: Math.max(0, this.backoffUntil - now),
    };
  }

  /** Snapshot then zero the failure/drop counters (heartbeat uses this). */
  drainStats(): PublishStats {
    const stats = this.getStats();
    this.failed = 0;
    this.dropped = 0;
    return stats;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      if (this.pending.size === 0) return;
      const batch = [...this.pending.values()];
      this.pending.clear();
      this.refreshCircuitLogFlag();
      if (this.isBlocked()) {
        this.dropped += batch.length;
        return;
      }
      await Promise.all(batch.map((item) => this.send(item)));
    } finally {
      this.flushing = false;
    }
  }

  private ensureTimer(): void {
    if (!this.autoFlush || this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
  }

  private isBlocked(): boolean {
    const now = this.now();
    return now < this.circuitUntil || now < this.backoffUntil;
  }

  private refreshCircuitLogFlag(): void {
    if (this.circuitLogged && this.now() >= this.circuitUntil) {
      this.circuitLogged = false;
    }
  }

  private openCircuit(status: number): void {
    const alreadyLogged = this.circuitLogged;
    this.circuitUntil = this.now() + PUBLISH_CIRCUIT_MS;
    if (!alreadyLogged) {
      this.circuitLogged = true;
      this.log(
        "warn",
        `Publish circuit open for 10 minutes after HTTP ${status}; dropping events`,
      );
    }
  }

  private applyBackoff(reason: string): void {
    const now = this.now();
    if (now < this.backoffUntil) return;
    const sleep = this.backoffMs * (0.5 + this.random() * 0.5);
    this.backoffUntil = now + sleep;
    this.backoffMs = Math.min(this.backoffMs * 2, PUBLISH_BACKOFF_MAX_MS);
    this.log("warn", `Publish backing off ${Math.round(sleep)}ms after ${reason}`);
  }

  private async acquireSlot(): Promise<void> {
    if (this.inflight < MAX_INFLIGHT) {
      this.inflight++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.pendingSlots.push(resolve);
    });
  }

  private releaseSlot(): void {
    const next = this.pendingSlots.shift();
    if (next) {
      next();
      return;
    }
    this.inflight--;
  }

  private backoffReason(status: number, body: string): string {
    if (isCloudflare1027(body)) return "Cloudflare 1027";
    return `HTTP ${status}`;
  }

  private async send(item: PendingPublish): Promise<void> {
    if (this.isBlocked()) {
      this.dropped++;
      return;
    }

    await this.acquireSlot();
    try {
      if (this.isBlocked()) {
        this.dropped++;
        return;
      }

      const res = await this.fetchFn(publishUrl(item.config.workerUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Streamer-Secret": item.config.streamerSecret,
        },
        body: JSON.stringify({ roomKey: item.roomKey, event: item.event }),
      });
      const body = await res.text();
      const kind = classifyPublishResponse(res.status, body);
      if (kind === "ok") {
        if (!this.isBlocked()) this.backoffMs = PUBLISH_BACKOFF_INITIAL_MS;
        return;
      }
      this.failed++;
      if (kind === "circuit") this.openCircuit(res.status);
      else if (kind === "backoff") this.applyBackoff(this.backoffReason(res.status, body));
    } catch {
      this.failed++;
      this.applyBackoff("network error");
    } finally {
      this.releaseSlot();
    }
  }
}

let defaultPublisher = new ChartPublisher();

export function publishEvent(
  config: PublishConfig,
  roomKey: string,
  event: ChartLiveEvent,
): boolean {
  return defaultPublisher.publish(config, roomKey, event);
}

export function getInflightCount(): number {
  return defaultPublisher.getInflightCount();
}

export function getPublishStats(): PublishStats {
  return defaultPublisher.getStats();
}

export function drainPublishStats(): PublishStats {
  return defaultPublisher.drainStats();
}

export function stopPublisher(): void {
  defaultPublisher.stop();
}

export async function flushPublisher(): Promise<void> {
  await defaultPublisher.flush();
}

export function resetPublisher(deps?: PublishDeps): void {
  defaultPublisher.stop();
  defaultPublisher = new ChartPublisher(deps);
}
