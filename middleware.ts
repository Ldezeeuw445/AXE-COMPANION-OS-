/**
 * Lightweight middleware — session refresh only, NO database calls.
 *
 * This calls Supabase Auth's token-refresh endpoint so that the server-side
 * `supabase.auth.getUser()` inside Server Components and Route Handlers always
 * finds a valid session. Without this, an expired JWT is never renewed and
 * every auth check silently returns null.
 *
 * We deliberately removed the old broker-account cache-warming query that
 * previously ran on every request. That caused 200 k+ unnecessary DB hits per
 * day because the in-memory Map never survives between Edge/Serverless
 * invocations. All DB fetching now happens lazily inside the routes/hooks that
 * actually need the data.
 */

import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Only run on page/API routes; skip all static assets.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
};
