import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHARED_NEWS_SELECT,
  SHARED_NEWS_STALE_MS,
  classifySharedNewsFreshness,
  compactSharedNewsForAxe,
  loadSharedNewsItems,
  mapSharedNewsRow,
  pickSharedNewsForContext,
  sharedNewsToFeedItem,
  type SharedNewsRow,
} from "./sharedNewsItems.ts";

const now = Date.parse("2026-11-18T12:00:00.000Z");

function row(partial: Partial<SharedNewsRow> = {}): SharedNewsRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    source: "finnhub",
    publisher: "Reuters",
    published_at: "2026-11-18T10:45:01.000Z",
    instruments: ["BTCUSD"],
    url: "https://example.com/btc",
    title: "Bitcoin steadies after earnings",
    summary: "Bids held near 60k.",
    impact: null,
    sentiment: null,
    ...partial,
  };
}

describe("SHARED_NEWS_SELECT", () => {
  it("matches the TOS #69 authenticated read contract", () => {
    assert.equal(
      SHARED_NEWS_SELECT,
      "id,source,publisher,published_at,instruments,url,title,summary,impact,sentiment",
    );
  });
});

describe("mapSharedNewsRow", () => {
  it("keeps real fields and leaves missing impact/sentiment as null", () => {
    const mapped = mapSharedNewsRow(row());
    assert.ok(mapped);
    assert.equal(mapped.title, "Bitcoin steadies after earnings");
    assert.equal(mapped.publisher, "Reuters");
    assert.equal(mapped.source, "finnhub");
    assert.deepEqual(mapped.instruments, ["BTCUSD"]);
    assert.equal(mapped.impact, null);
    assert.equal(mapped.sentiment, null);
    assert.equal(mapped.url, "https://example.com/btc");
  });

  it("drops rows without a title or without a valid published_at", () => {
    assert.equal(mapSharedNewsRow(row({ title: "   " })), null);
    assert.equal(mapSharedNewsRow(row({ published_at: "not-a-date" })), null);
    assert.equal(mapSharedNewsRow(row({ published_at: null })), null);
  });

  it("does not invent a publisher, url or summary", () => {
    const mapped = mapSharedNewsRow(
      row({ publisher: null, url: null, summary: null, instruments: [] }),
    );
    assert.ok(mapped);
    assert.equal(mapped.publisher, null);
    assert.equal(mapped.url, null);
    assert.equal(mapped.summary, null);
    assert.deepEqual(mapped.instruments, []);
  });
});

describe("classifySharedNewsFreshness", () => {
  it("is empty when there are no items", () => {
    assert.equal(classifySharedNewsFreshness(null, now), "empty");
  });

  it("is ok when the newest item is within the stale window", () => {
    const newest = new Date(now - 30 * 60_000).toISOString();
    assert.equal(classifySharedNewsFreshness(newest, now), "ok");
  });

  it("is stale when the newest item is older than the stale window", () => {
    const newest = new Date(now - SHARED_NEWS_STALE_MS - 1).toISOString();
    assert.equal(classifySharedNewsFreshness(newest, now), "stale");
  });
});

describe("sharedNewsToFeedItem", () => {
  it("maps a headline onto the Daily News lane without filling nulls", () => {
    const item = sharedNewsToFeedItem(mapSharedNewsRow(row())!);
    assert.equal(item.kind, "daily_news");
    assert.equal(item.title, "Bitcoin steadies after earnings");
    assert.match(item.body, /Bids held near 60k/);
    assert.doesNotMatch(item.body, /null|impact|sentiment|0\.0/);
    assert.equal(item.url, "https://example.com/btc");
    assert.equal(item.createdAt, "2026-11-18T10:45:01.000Z");
  });

  it("falls back to publisher/source when summary is missing", () => {
    const item = sharedNewsToFeedItem(
      mapSharedNewsRow(row({ summary: null, publisher: "CNBC" }))!,
    );
    assert.match(item.body, /CNBC/);
    assert.doesNotMatch(item.body, /null/);
  });
});

describe("pickSharedNewsForContext", () => {
  it("prefers the active symbol, then general market items", () => {
    const gold = mapSharedNewsRow(row({ id: "g", instruments: ["XAUUSD"], title: "Gold jumps" }))!;
    const general = mapSharedNewsRow(row({ id: "n", instruments: [], title: "Risk-off day" }))!;
    const btc = mapSharedNewsRow(row({ id: "b", instruments: ["BTCUSD"], title: "BTC holds" }))!;
    const picked = pickSharedNewsForContext([btc, gold, general], {
      symbol: "XAUUSD",
      watchlist: ["NAS100"],
      limit: 4,
    });
    assert.equal(picked[0].title, "Gold jumps");
    assert.ok(picked.some((p) => p.title === "Risk-off day"));
    assert.equal(
      picked.find((p) => p.title === "BTC holds"),
      undefined,
    );
  });
});

describe("compactSharedNewsForAxe", () => {
  it("names empty and stale states instead of inventing headlines", () => {
    assert.match(compactSharedNewsForAxe([], "empty"), /empty/i);
    assert.match(
      compactSharedNewsForAxe([], "stale", { newestAt: "2026-11-17T20:00:00.000Z" }),
      /stale/i,
    );
    assert.doesNotMatch(compactSharedNewsForAxe([], "empty"), /Reuters|0/);
  });

  it("lists recent titles with publisher when present, skipping null impact", () => {
    const items = [mapSharedNewsRow(row())!];
    const line = compactSharedNewsForAxe(items, "ok");
    assert.match(line, /Bitcoin steadies after earnings/);
    assert.match(line, /Reuters/);
    assert.doesNotMatch(line, /impact|sentiment|null/);
  });
});

describe("loadSharedNewsItems", () => {
  it("returns unavailable when supabase is missing or the query errors", async () => {
    assert.deepEqual(await loadSharedNewsItems(null), {
      items: [],
      state: "unavailable",
      newestAt: null,
    });
    const failing = {
      from() {
        return {
          select() {
            return {
              order() {
                return {
                  async limit() {
                    return { data: null, error: { message: "permission denied" } };
                  },
                };
              },
            };
          },
        };
      },
    };
    assert.equal((await loadSharedNewsItems(failing)).state, "unavailable");
  });

  it("maps live rows and reports ok/stale from published_at", async () => {
    const client = {
      from() {
        return {
          select() {
            return {
              order() {
                return {
                  async limit() {
                    return { data: [row()], error: null };
                  },
                };
              },
            };
          },
        };
      },
    };
    const fresh = await loadSharedNewsItems(client, { nowMs: now });
    assert.equal(fresh.state, "ok");
    assert.equal(fresh.items.length, 1);
    assert.equal(fresh.newestAt, "2026-11-18T10:45:01.000Z");
  });
});
