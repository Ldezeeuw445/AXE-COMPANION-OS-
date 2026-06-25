/**
 * engine/core/cache.ts
 * ====================
 * Layer B — Cache engine with 3 states:
 *   FRESH    → return cached data
 *   STALE    → return cached data + background refresh
 *   MISS     → fetch new data
 */

export type CacheState = 'fresh' | 'stale' | 'miss';

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  expiresAt: number;   // fresh until
  staleAt: number;     // stale until (then evicted)
  key: string;
}

export interface CacheResult<T> {
  data: T;
  state: CacheState;
}

export class CacheEngine {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize: number;
  private stats = {
    hits: 0,
    misses: 0,
    staleServes: 0,
    evictions: 0
  };

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  /**
   * Get from cache or execute fetcher.
   */
  async getOrFetch<T>(
    key: string,
    ttlMs: number,
    staleWhileRevalidate: boolean,
    fetcher: () => Promise<T>
  ): Promise<CacheResult<T>> {
    const now = Date.now();
    const cached = this.cache.get(key);

    // FRESH
    if (cached && now < cached.expiresAt) {
      this.stats.hits++;
      return { data: cached.data, state: 'fresh' };
    }

    // STALE — serve cached + background refresh
    if (cached && staleWhileRevalidate && now < cached.staleAt) {
      this.stats.staleServes++;
      this.backgroundRefresh(key, ttlMs, staleWhileRevalidate, fetcher);
      return { data: cached.data, state: 'stale' };
    }

    // MISS
    this.stats.misses++;
    try {
      const data = await fetcher();
      this.set(key, data, ttlMs, staleWhileRevalidate);
      return { data, state: 'miss' };
    } catch (e) {
      // Last-good fallback: if we have cached data still within stale window, return it.
      if (cached && now < cached.staleAt) {
        this.stats.staleServes++;
        return { data: cached.data, state: 'stale' };
      }
      throw e;
    }
  }

  /**
   * Get without fetching (peek).
   */
  peek<T>(key: string): T | undefined {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
    return undefined;
  }

  /**
   * Manually set cache entry.
   */
  set<T>(key: string, data: T, ttlMs: number, staleWhileRevalidate = false): void {
    const now = Date.now();

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
      if (oldest) {
        this.cache.delete(oldest[0]);
        this.stats.evictions++;
      }
    }

    this.cache.set(key, {
      data,
      fetchedAt: now,
      expiresAt: now + ttlMs,
      staleAt: staleWhileRevalidate ? now + ttlMs * 2 : now + ttlMs,
      key
    });
  }

  /**
   * Invalidate by pattern or all.
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const [key] of this.cache) {
      if (key.includes(pattern)) this.cache.delete(key);
    }
  }

  getStats() {
    return { ...this.stats, size: this.cache.size };
  }

  private async backgroundRefresh<T>(
    key: string,
    ttlMs: number,
    staleWhileRevalidate: boolean,
    fetcher: () => Promise<T>
  ): Promise<void> {
    try {
      const data = await fetcher();
      this.set(key, data, ttlMs, staleWhileRevalidate);
    } catch {
      // Background refresh failed — stale data remains until eviction
    }
  }
}
