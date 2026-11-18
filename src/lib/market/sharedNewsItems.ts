/**
 * Read-side mapping for `public.shared_news_items`.
 *
 * Trading OS owns the table and the intel-proxy cron that fills it
 * (axe-twins `shared/datamodel-afspraken.md`, TOS PR #69). Companion only
 * reads with the signed-in user (RLS: SELECT for `authenticated`).
 *
 * Null fields stay null — never shown as 0, "neutral", or "now".
 */

import type { AxeFeedItem } from "@/types/feed";

/** Exact column list from the TOS #69 Companion-read contract. */
export const SHARED_NEWS_SELECT =
  "id,source,publisher,published_at,instruments,url,title,summary,impact,sentiment";

/** Cron is every 30 minutes; older than this is called out as stale, not hidden. */
export const SHARED_NEWS_STALE_MS = 6 * 60 * 60 * 1000;

export type SharedNewsFreshness = "ok" | "empty" | "stale" | "unavailable";

export type SharedNewsRow = {
  id: string;
  source: string;
  publisher: string | null;
  published_at: string | null;
  instruments: string[] | null;
  url: string | null;
  title: string | null;
  summary: string | null;
  impact: string | null;
  sentiment: number | null;
};

export type SharedNewsItem = {
  id: string;
  source: string;
  publisher: string | null;
  publishedAt: string;
  instruments: string[];
  url: string | null;
  title: string;
  summary: string | null;
  impact: string | null;
  sentiment: number | null;
};

export function mapSharedNewsRow(row: SharedNewsRow | null | undefined): SharedNewsItem | null {
  if (!row) return null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title) return null;
  const publishedAt = typeof row.published_at === "string" ? row.published_at.trim() : "";
  if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) return null;
  const instruments = Array.isArray(row.instruments)
    ? row.instruments.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  const sentiment =
    row.sentiment == null || row.sentiment === undefined
      ? null
      : Number.isFinite(Number(row.sentiment))
        ? Number(row.sentiment)
        : null;
  return {
    id: String(row.id ?? ""),
    source: typeof row.source === "string" && row.source.trim() ? row.source.trim() : "shared",
    publisher: typeof row.publisher === "string" && row.publisher.trim() ? row.publisher.trim() : null,
    publishedAt,
    instruments,
    url: typeof row.url === "string" && row.url.trim() ? row.url.trim() : null,
    title,
    summary: typeof row.summary === "string" && row.summary.trim() ? row.summary.trim() : null,
    impact: typeof row.impact === "string" && row.impact.trim() ? row.impact.trim() : null,
    sentiment,
  };
}

export function classifySharedNewsFreshness(
  newestAt: string | null | undefined,
  nowMs = Date.now(),
): SharedNewsFreshness {
  if (!newestAt) return "empty";
  const ms = Date.parse(newestAt);
  if (!Number.isFinite(ms)) return "empty";
  if (nowMs - ms > SHARED_NEWS_STALE_MS) return "stale";
  return "ok";
}

function attribution(item: SharedNewsItem): string | null {
  return item.publisher || item.source || null;
}

export function sharedNewsToFeedItem(item: SharedNewsItem): AxeFeedItem {
  const parts: string[] = [];
  if (item.summary) parts.push(item.summary);
  else {
    const who = attribution(item);
    if (who) parts.push(who);
  }
  if (item.instruments.length > 0) parts.push(item.instruments.join(", "));
  return {
    id: `shared-news:${item.id}`,
    kind: "daily_news",
    title: item.title,
    body: parts.join(" · "),
    url: item.url,
    createdAt: item.publishedAt,
  };
}

export function pickSharedNewsForContext(
  items: SharedNewsItem[],
  opts: { symbol?: string | null; watchlist?: string[]; limit?: number },
): SharedNewsItem[] {
  const limit = opts.limit ?? 6;
  const focus = new Set(
    [opts.symbol, ...(opts.watchlist ?? [])]
      .map((s) => (s ?? "").trim().toUpperCase())
      .filter(Boolean),
  );
  const matched: SharedNewsItem[] = [];
  const general: SharedNewsItem[] = [];
  for (const item of items) {
    if (item.instruments.some((sym) => focus.has(sym.toUpperCase()))) matched.push(item);
    else if (item.instruments.length === 0) general.push(item);
  }
  return [...matched, ...general].slice(0, limit);
}

export function compactSharedNewsForAxe(
  items: SharedNewsItem[],
  state: SharedNewsFreshness,
  opts?: { newestAt?: string | null },
): string {
  if (state === "unavailable") {
    return "Shared news feed unavailable — continuing without those headlines.";
  }
  if (state === "empty" || items.length === 0) {
    if (state === "stale" && opts?.newestAt) {
      return `Shared news feed is stale (newest ${opts.newestAt}).`;
    }
    if (state === "stale") return "Shared news feed is stale.";
    return "Shared news feed is empty.";
  }
  const heads = items.slice(0, 6).map((item) => {
    const who = attribution(item);
    const inst = item.instruments.length > 0 ? ` (${item.instruments.join(", ")})` : "";
    return `“${item.title}”${who ? ` — ${who}` : ""}${inst}`;
  });
  const prefix = state === "stale" ? "Shared news (stale)" : "Shared news";
  return `${prefix}: ${heads.join(" | ")}.`;
}

export type SharedNewsLoadResult = {
  items: SharedNewsItem[];
  state: SharedNewsFreshness;
  newestAt: string | null;
};

type SharedNewsQueryResult = {
  data: SharedNewsRow[] | null;
  error: { message?: string } | null;
};

type SharedNewsQueryClient = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => {
        limit: (n: number) => PromiseLike<SharedNewsQueryResult>;
      };
    };
  };
};

/**
 * Authenticated (or service-role) read of the shared feed. Errors and empty
 * tables become a graceful state — callers must not invent headlines.
 */
export async function loadSharedNewsItems(
  supabase: SharedNewsQueryClient | null | undefined,
  opts?: { limit?: number; nowMs?: number },
): Promise<SharedNewsLoadResult> {
  if (!supabase) return { items: [], state: "unavailable", newestAt: null };
  const limit = opts?.limit ?? 50;
  try {
    const { data, error } = await supabase
      .from("shared_news_items")
      .select(SHARED_NEWS_SELECT)
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) return { items: [], state: "unavailable", newestAt: null };
    const items = (data ?? [])
      .map((row) => mapSharedNewsRow(row))
      .filter((row): row is SharedNewsItem => row != null);
    const newestAt = items[0]?.publishedAt ?? null;
    const state = items.length === 0 ? "empty" : classifySharedNewsFreshness(newestAt, opts?.nowMs);
    return { items, state, newestAt };
  } catch {
    return { items: [], state: "unavailable", newestAt: null };
  }
}
