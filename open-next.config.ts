import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Cloudflare adapter config.
 *
 * Defaults on purpose. The portability check before starting this migration
 * found nothing that needs an override: middleware.ts imports only
 * @supabase/ssr and next/server, none of the 78 API routes touch fs, node: or
 * process.cwd(), and the 46 that declare runtime = "nodejs" are covered by the
 * nodejs_compat flag in wrangler.jsonc.
 */
export default defineCloudflareConfig();
