/**
 * engine/core/dedupe.ts
 * =====================
 * Inflight request deduplication.
 * If 4 widgets request the same data simultaneously, only 1 API call is made.
 */

interface InflightRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

export class InflightDeduper {
  private inflight = new Map<string, InflightRequest<any>>();
  private maxAgeMs: number;
  private stats = { dedupes: 0 };

  constructor(maxAgeMs = 30000) {
    this.maxAgeMs = maxAgeMs;
  }

  /**
   * Execute fetcher, or return existing inflight promise if same key is already in flight.
   */
  async dedupe<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    const now = Date.now();

    if (existing && now - existing.timestamp < this.maxAgeMs) {
      this.stats.dedupes++;
      return existing.promise;
    }

    const promise = fetcher().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, { promise, timestamp: now });
    return promise;
  }

  getStats(): { dedupes: number; active: number } {
    return { dedupes: this.stats.dedupes, active: this.inflight.size };
  }

  clear(): void {
    this.inflight.clear();
  }
}
