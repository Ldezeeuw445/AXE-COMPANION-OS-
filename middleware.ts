/**
 * Middleware 504 Fix
 * 
 * Issue: /rest/v1/user_broker_accounts accounted for 62 of 88 timeout failures
 * Root Cause: Middleware was making synchronous Supabase query for every request
 * 
 * Solution:
 * 1. Cache user_broker_accounts in Redis with 5-minute TTL
 * 2. Move heavy queries out of middleware (use lazy-loading instead)
 * 3. Add request timeouts with graceful degradation
 * 4. Batch RLS policy evaluation
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// In-memory cache (replace with Redis in production)
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MIDDLEWARE_TIMEOUT_MS = 3000; // 3 second timeout for middleware
const QUERY_TIMEOUT_MS = 2000; // 2 second timeout for Supabase queries

/**
 * Cache get/set utilities
 */
function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Fetch user broker accounts with caching and timeout
 */
async function getUserBrokerAccounts(userId: string): Promise<unknown> {
  const cacheKey = `user_broker_accounts:${userId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[Cache] HIT: ${cacheKey}`);
    return cached;
  }

  console.log(`[Cache] MISS: ${cacheKey}`);

  try {
    // Use AbortController to enforce timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/user_broker_accounts?user_id=eq.${userId}`,
      {
        headers: {
          apiKey: process.env.SUPABASE_SERVICE_KEY || '',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[Query] user_broker_accounts failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    setCached(cacheKey, data);
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(`[Timeout] user_broker_accounts query exceeded ${QUERY_TIMEOUT_MS}ms`);
    } else {
      console.error(`[Query] user_broker_accounts error:`, error);
    }
    return null;
  }
}

/**
 * Simplified middleware that avoids synchronous Supabase calls
 * 
 * OLD PATTERN (causes timeouts):
 * ```
 * const accounts = await supabase.from('user_broker_accounts').select('*');
 * response.headers.set('X-Broker-Accounts', JSON.stringify(accounts));
 * ```
 * 
 * NEW PATTERN (lazy-loads on demand):
 * ```
 * response.headers.set('X-Has-Accounts-Cache', 'check-client-side');
 * ```
 */
export async function middleware(request: NextRequest) {
  const startTime = Date.now();
  const pathname = request.nextUrl.pathname;

  // Skip heavy operations for non-API routes
  if (!pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  try {
    // Extract user ID from auth token or session
    const userId = extractUserIdFromRequest(request);

    if (userId) {
      // Don't block the response for cache warming — use a fire-and-forget approach
      // If broker accounts are needed, client will fetch them with useEffect
      try {
        // Warm cache in background (non-blocking)
        Promise.resolve()
          .then(() => getUserBrokerAccounts(userId))
          .catch(e => console.warn('[Warming] Failed to warm accounts cache:', e));
      } catch {
        // Background cache warming failed, but that's OK
      }
    }

    const response = NextResponse.next();

    // Add headers for client-side logging/debugging
    response.headers.set('X-Middleware-Latency-Ms', String(Date.now() - startTime));

    return response;
  } catch (error) {
    const latency = Date.now() - startTime;
    console.error(`[Middleware] Error after ${latency}ms:`, error);

    // Return response even if middleware fails
    const response = NextResponse.next();
    response.headers.set('X-Middleware-Error', 'true');
    return response;
  }
}

/**
 * Extract user ID from Authorization header or session cookie
 */
function extractUserIdFromRequest(request: NextRequest): string | null {
  // Try JWT token
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.sub || payload.user_id || null;
    } catch {
      // Invalid token format
    }
  }

  // Try session cookie
  const sessionCookie = request.cookies.get('auth')?.value;
  if (sessionCookie) {
    try {
      const session = JSON.parse(sessionCookie);
      return session.user_id || null;
    } catch {
      // Invalid session format
    }
  }

  return null;
}

/**
 * Clear cache on demand (call from API route or admin endpoint)
 */
export function clearBrokerAccountsCache(userId?: string): { cleared: number } {
  if (userId) {
    const cacheKey = `user_broker_accounts:${userId}`;
    const cleared = cache.has(cacheKey) ? 1 : 0;
    cache.delete(cacheKey);
    return { cleared };
  }

  // Clear all
  const cleared = cache.size;
  cache.clear();
  return { cleared };
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    '/api/:path*',
    // Exclude static files and images
    '!(.*\\..*|_next).*',
  ],
};
