/**
 * Lightweight middleware — NO database calls.
 *
 * Previously this middleware fired a Supabase query on every API request as
 * "background cache warming". That is futile in Next.js Edge/Serverless
 * runtime because each invocation is stateless — the in-memory Map never
 * survives between requests, so every request paid a full round-trip to
 * Supabase for nothing. This caused 200k+ unnecessary DB hits per day.
 *
 * Broker account data is now fetched lazily inside the routes/hooks that
 * actually need it.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  // Pass through — all auth and data fetching happens inside route handlers.
  return NextResponse.next();
}

// Only run on page/API routes; skip all static assets.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
};
