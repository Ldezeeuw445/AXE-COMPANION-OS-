/**
 * OpenNext adapter config — this is what lets Next.js run on Cloudflare Workers
 * instead of Vercel.
 *
 * WHY THIS EXISTS AT ALL: axecompanion.com has been answering
 * `HTTP 402 Payment required, x-vercel-error: DEPLOYMENT_DISABLED` — Vercel
 * disabled the deployment over billing, so the site is not broken, it is
 * switched off. Moving hosting removes that failure mode entirely, and it is
 * also the prerequisite for the Play Store build: a TWA points at a live URL,
 * so nothing can be packaged while the origin is dark.
 *
 * Checked before starting rather than assumed, because a Next.js app can be
 * anywhere on the spectrum from "static export" to "unportable":
 *   - middleware.ts imports only @supabase/ssr and next/server — no Node APIs,
 *     which matters because Node.js-in-middleware is the one thing this
 *     adapter still does not support.
 *   - 0 of the 78 API routes import fs, node: or use process.cwd().
 *   - 46 routes declare `runtime = "nodejs"`, which nodejs_compat covers.
 *
 * Next had to move 16.2.1 -> 16.2.12: the adapter's peer range is
 * `>=15.5.21 <16 || >=16.2.11`, and 16.2.1 falls in the gap between those two
 * windows. A patch bump inside the same minor, not an upgrade.
 */
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({
  // Incremental cache is deliberately left at the default (in-memory per
  // isolate) for the first deploy. Wiring R2 or KV as a shared cache is a
  // second change with its own failure modes, and mixing it into the migration
  // would make "did hosting break, or did caching break" unanswerable.
});
