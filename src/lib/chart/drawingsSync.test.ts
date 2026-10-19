import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLocalSave,
  coerceDrawingIds,
  groupByStorageKey,
  isNewerThan,
  isUuid,
  mergeDrawingsLastWriteWins,
  normalizeSymbol,
  normalizeTimeframe,
  parseStorageKeySuffix,
  parseUpdatedAtMs,
  visibleForChart,
  type SyncedDrawing,
} from "./drawingsSync";

function drawing(
  overrides: Partial<SyncedDrawing> & Pick<SyncedDrawing, "id" | "updatedAt">,
): SyncedDrawing {
  return {
    symbol: "XAUUSD",
    timeframe: "h1",
    toolType: "trendline",
    drawing: { id: overrides.id, type: "trendline" },
    createdAt: "2026-01-01T00:00:00.000Z",
    deleted: false,
    ...overrides,
  };
}

describe("drawingsSync timestamps", () => {
  it("treats invalid dates as epoch", () => {
    assert.equal(parseUpdatedAtMs("not-a-date"), 0);
    assert.equal(parseUpdatedAtMs(undefined), 0);
  });

  it("isNewerThan is strict", () => {
    assert.equal(isNewerThan("2026-01-02T00:00:00.000Z", "2026-01-01T00:00:00.000Z"), true);
    assert.equal(isNewerThan("2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z"), false);
    assert.equal(isNewerThan("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"), false);
  });
});

describe("mergeDrawingsLastWriteWins", () => {
  it("prefers the local row when it has a later updatedAt", () => {
    const local = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-02T00:00:00.000Z",
      toolType: "rectangle",
    });
    const remote = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-01T00:00:00.000Z",
      toolType: "trendline",
    });
    const { merged, toPush } = mergeDrawingsLastWriteWins([local], [remote]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].toolType, "rectangle");
    assert.equal(toPush.length, 1);
    assert.equal(toPush[0].id, local.id);
  });

  it("prefers the remote row when it has a later updatedAt", () => {
    const local = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-01T00:00:00.000Z",
      toolType: "rectangle",
    });
    const remote = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-02T00:00:00.000Z",
      toolType: "trendline",
    });
    const { merged, toPush } = mergeDrawingsLastWriteWins([local], [remote]);
    assert.equal(merged[0].toolType, "trendline");
    assert.equal(toPush.length, 0);
  });

  it("on equal updatedAt keeps remote (stable last-write-wins)", () => {
    const stamp = "2026-06-01T12:00:00.000Z";
    const local = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: stamp,
      toolType: "rectangle",
    });
    const remote = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: stamp,
      toolType: "trendline",
    });
    const { merged, toPush } = mergeDrawingsLastWriteWins([local], [remote]);
    assert.equal(merged[0].toolType, "trendline");
    assert.equal(toPush.length, 0);
  });

  it("pushes local-only drawings (first sign-in migrate)", () => {
    const local = drawing({
      id: "22222222-2222-4222-8222-222222222222",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const remote = drawing({
      id: "33333333-3333-4333-8333-333333333333",
      updatedAt: "2026-06-01T00:00:00.000Z",
      symbol: "EURUSD",
    });
    const { merged, toPush } = mergeDrawingsLastWriteWins([local], [remote]);
    assert.equal(merged.length, 2);
    assert.equal(toPush.length, 1);
    assert.equal(toPush[0].id, local.id);
    assert.ok(merged.some((row) => row.id === remote.id));
  });

  it("a newer tombstone wins over a stale live copy", () => {
    const tombstone = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-03T00:00:00.000Z",
      deleted: true,
    });
    const stale = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-01T00:00:00.000Z",
      deleted: false,
    });
    const { merged } = mergeDrawingsLastWriteWins([tombstone], [stale]);
    assert.equal(merged[0].deleted, true);
  });

  it("a newer edit resurrects an older tombstone", () => {
    const tombstone = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-01T00:00:00.000Z",
      deleted: true,
    });
    const edit = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-04T00:00:00.000Z",
      deleted: false,
      toolType: "text",
    });
    const { merged, toPush } = mergeDrawingsLastWriteWins([edit], [tombstone]);
    assert.equal(merged[0].deleted, false);
    assert.equal(merged[0].toolType, "text");
    assert.equal(toPush.length, 1);
  });
});

describe("applyLocalSave tombstones", () => {
  it("marks removed ids as deleted with a fresh updatedAt", () => {
    const keep = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const drop = drawing({
      id: "22222222-2222-4222-8222-222222222222",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const now = "2026-06-09T00:00:00.000Z";
    const next = applyLocalSave([keep, drop], [keep], now);
    const dropped = next.find((row) => row.id === drop.id);
    assert.ok(dropped);
    assert.equal(dropped?.deleted, true);
    assert.equal(dropped?.updatedAt, now);
    const kept = next.find((row) => row.id === keep.id);
    assert.equal(kept?.deleted, false);
  });

  it("does not bump timestamps on existing tombstones", () => {
    const tomb = drawing({
      id: "22222222-2222-4222-8222-222222222222",
      updatedAt: "2026-06-02T00:00:00.000Z",
      deleted: true,
    });
    const keep = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-03T00:00:00.000Z",
    });
    const next = applyLocalSave([keep, tomb], [keep], "2026-06-09T00:00:00.000Z");
    const still = next.find((row) => row.id === tomb.id);
    assert.equal(still?.deleted, true);
    assert.equal(still?.updatedAt, "2026-06-02T00:00:00.000Z");
  });

  it("clearing everything tombstones the previous live set", () => {
    const a = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const now = "2026-06-09T00:00:00.000Z";
    const next = applyLocalSave([a], [], now);
    assert.equal(next.length, 1);
    assert.equal(next[0].deleted, true);
    assert.equal(next[0].updatedAt, now);
  });
});

describe("visibleForChart", () => {
  it("hides tombstones", () => {
    const live = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const dead = drawing({
      id: "22222222-2222-4222-8222-222222222222",
      updatedAt: "2026-06-01T00:00:00.000Z",
      deleted: true,
    });
    const visible = visibleForChart([live, dead], "xauusd", "H1");
    assert.deepEqual(visible.map((row) => row.id), [live.id]);
  });

  it("includes null-timeframe drawings on every tf of that symbol", () => {
    const anyTf = drawing({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-01T00:00:00.000Z",
      timeframe: null,
    });
    const other = drawing({
      id: "22222222-2222-4222-8222-222222222222",
      updatedAt: "2026-06-01T00:00:00.000Z",
      timeframe: "m15",
    });
    const visible = visibleForChart([anyTf, other], "XAUUSD", "h1");
    assert.deepEqual(visible.map((row) => row.id), [anyTf.id]);
  });
});

describe("coerceDrawingIds", () => {
  it("leaves UUIDs alone", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    assert.equal(isUuid(id), true);
    const { drawings, changed } = coerceDrawingIds([
      drawing({ id, updatedAt: "2026-06-01T00:00:00.000Z" }),
    ]);
    assert.equal(changed, false);
    assert.equal(drawings[0].id, id);
  });

  it("rewrites legacy Date.now ids so they can upsert into uuid PK", () => {
    const minted = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const { drawings, changed } = coerceDrawingIds(
      [drawing({ id: "1710000000000-ab12cd", updatedAt: "2026-06-01T00:00:00.000Z" })],
      () => minted,
    );
    assert.equal(changed, true);
    assert.equal(drawings[0].id, minted);
    assert.equal(drawings[0].drawing.id, minted);
  });
});

describe("storage grouping", () => {
  it("groups by symbol and timeframe", () => {
    const rows = [
      drawing({
        id: "11111111-1111-4111-8111-111111111111",
        updatedAt: "2026-06-01T00:00:00.000Z",
        symbol: "xauusd",
        timeframe: "H1",
      }),
      drawing({
        id: "22222222-2222-4222-8222-222222222222",
        updatedAt: "2026-06-01T00:00:00.000Z",
        symbol: "EURUSD",
        timeframe: "m15",
      }),
    ];
    const groups = groupByStorageKey(rows);
    assert.equal(groups.size, 2);
    assert.ok(groups.has("XAUUSD.h1"));
    assert.ok(groups.has("EURUSD.m15"));
  });

  it("parses localStorage key suffixes", () => {
    assert.deepEqual(parseStorageKeySuffix("XAUUSD.h1"), { symbol: "XAUUSD", timeframe: "h1" });
    assert.equal(parseStorageKeySuffix("nope"), null);
  });

  it("normalizes symbol and timeframe", () => {
    assert.equal(normalizeSymbol(" eurusd "), "EURUSD");
    assert.equal(normalizeTimeframe(" H1 "), "h1");
    assert.equal(normalizeTimeframe(""), null);
  });
});
