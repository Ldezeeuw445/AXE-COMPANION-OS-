import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { summarizeFeedUnread, feedUnreadBadgeClass } from "./feedUnread";
import type { AxeFeedItem } from "@/types/feed";

const originalLocalStorage = globalThis.localStorage;

function mockStorage(map: Record<string, string>) {
  const store = { ...map };
  const localStorage = {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: () => null,
    length: 0,
  };
  // feedSeen gates on `typeof window !== "undefined"`.
  (globalThis as { window?: unknown; localStorage?: unknown }).window = globalThis;
  (globalThis as { localStorage?: unknown }).localStorage = localStorage;
  (globalThis as { window: { localStorage?: unknown } }).window.localStorage = localStorage;
}

afterEach(() => {
  // @ts-expect-error restore
  globalThis.localStorage = originalLocalStorage;
});

function item(partial: Partial<AxeFeedItem> & Pick<AxeFeedItem, "id" | "kind" | "createdAt">): AxeFeedItem {
  return {
    title: partial.title ?? partial.id,
    body: partial.body ?? "",
    url: partial.url ?? null,
    ...partial,
  };
}

describe("summarizeFeedUnread", () => {
  it("splits unread counts by lane and picks primary tab color", () => {
    mockStorage({});
    const now = Date.now();
    const items = [
      item({ id: "1", kind: "briefing", createdAt: new Date(now - 60_000).toISOString() }),
      item({ id: "2", kind: "daily_news", createdAt: new Date(now - 30_000).toISOString() }),
      item({ id: "3", kind: "market_recap", createdAt: new Date(now - 10_000).toISOString() }),
    ];
    const summary = summarizeFeedUnread(items);
    assert.equal(summary.byTab.morning_brief, 1);
    assert.equal(summary.byTab.daily_news, 1);
    assert.equal(summary.byTab.market_recap, 1);
    assert.equal(summary.total, 3);
    assert.equal(summary.primaryTab, "market_recap");
    assert.equal(feedUnreadBadgeClass(summary.primaryTab), "bg-emerald-400");
  });

  it("drops a lane after its last-seen advances", () => {
    const now = Date.now();
    const stamp = new Date(now - 5_000).toISOString();
    mockStorage({
      "axe.feed.lastSeenAt.morning_brief": stamp,
      "axe.feed.lastSeenAt.daily_news": stamp,
      "axe.feed.lastSeenAt.market_recap": new Date(now - 120_000).toISOString(),
    });
    const items = [
      item({ id: "1", kind: "briefing", createdAt: new Date(now - 60_000).toISOString() }),
      item({ id: "2", kind: "daily_news", createdAt: new Date(now - 60_000).toISOString() }),
      item({ id: "3", kind: "market_recap", createdAt: new Date(now - 60_000).toISOString() }),
    ];
    const summary = summarizeFeedUnread(items);
    assert.equal(summary.byTab.morning_brief, 0);
    assert.equal(summary.byTab.daily_news, 0);
    assert.equal(summary.byTab.market_recap, 1);
    assert.equal(summary.total, 1);
  });
});
