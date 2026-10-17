import "server-only";
import { generateBroadcastLocally } from "@/services/broadcastGenerator";

/**
 * Daily News and Market Recap, written by AXE from its own market data.
 *
 * This replaces the Krater integration. Krater was one of three possible
 * sources behind these two broadcasts, and the only one that cost money and
 * needed a key — `krater_api_key_set` had been `false` on the host for as long
 * as anyone measured, so in practice the local generator was already doing the
 * work. Luka's call on 2026-10-11: it brings nothing. So it is gone, along
 * with ~400 lines of polling, probing and conversation-scraping for an API
 * that did not expose the endpoints the code hoped for.
 *
 * The route is still called `/api/cron/krater-feed-sync`. Renaming it means
 * moving a registered pg_cron job and a row in `axe_ops.cron_job` in step with
 * a deploy, and a mistimed rename leaves the feed silent for a day. Not worth
 * it for a name. The path is a label; this file is the behaviour.
 */

export type BroadcastKind = "daily_news" | "market_recap";

export function defaultBroadcastTitle(kind: BroadcastKind): string {
  return kind === "market_recap" ? "Market Recap" : "Daily News";
}

/**
 * Strip personalisation from broadcast copy.
 *
 * A broadcast goes to every user, so a name in it is wrong for all but one of
 * them. The prompts say not to use names; models do it anyway often enough
 * that this stays as a net.
 */
export function normalizeBroadcastBody(body: string): string {
  return body
    .replace(/,\s*Luka\s*:/gi, ":")
    .replace(/for active traders,\s*Luka/gi, "for active traders")
    .replace(/for traders,\s*Luka/gi, "for traders")
    .trim();
}

export async function fetchBroadcastOutput(
  kind: BroadcastKind,
): Promise<{ body: string; source: "axe_local" }> {
  const body = await generateBroadcastLocally(kind);
  return { body, source: "axe_local" };
}
