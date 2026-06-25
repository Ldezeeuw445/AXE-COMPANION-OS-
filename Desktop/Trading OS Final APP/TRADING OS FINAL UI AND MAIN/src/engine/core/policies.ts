/**
 * engine/core/policies.ts
 * =======================
 * SourcePolicy contract and priority types.
 * Every service defines its own policy per datatype.
 */

export type Priority = 'FAST' | 'CHEAP' | 'ACCURATE' | 'BALANCED';

export interface SourcePolicy {
  priority: Priority;
  fallback: boolean;
  cacheTtlMs: number;
  staleWhileRevalidate?: boolean;
}

export const DEFAULT_POLICIES = {
  news: {
    priority: 'ACCURATE' as Priority,
    fallback: true,
    cacheTtlMs: 120_000,
    staleWhileRevalidate: true
  },
  macro: {
    priority: 'ACCURATE' as Priority,
    fallback: true,
    cacheTtlMs: 3_600_000,
    staleWhileRevalidate: true
  },
  account: {
    priority: 'FAST' as Priority,
    fallback: false,
    cacheTtlMs: 5_000,
    staleWhileRevalidate: false
  },
  chart: {
    priority: 'FAST' as Priority,
    fallback: true,
    cacheTtlMs: 30_000,
    staleWhileRevalidate: true
  },
  scanner: {
    priority: 'FAST' as Priority,
    fallback: true,
    cacheTtlMs: 60_000,
    staleWhileRevalidate: true
  },
  axe: {
    priority: 'ACCURATE' as Priority,
    fallback: true,
    cacheTtlMs: 30_000,
    staleWhileRevalidate: true
  },
  earnings: {
    priority: 'ACCURATE' as Priority,
    fallback: true,
    cacheTtlMs: 300_000,
    staleWhileRevalidate: true
  }
};
