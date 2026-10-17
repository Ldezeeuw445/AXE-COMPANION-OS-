import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dropJournalItem,
  enqueueJournalItem,
  itemsReadyToFlush,
  markJournalAttempt,
  parseJournalQueue,
  type QueuedJournalItem,
} from "./offlineUploadQueue";

const save: QueuedJournalItem = {
  id: "save_1",
  createdAt: 1,
  attempts: 0,
  payload: { kind: "save", tradeId: "t1", accountId: "a1", label: "Good", note: "held the level" },
};

describe("offlineUploadQueue", () => {
  it("enqueues, retries, then drops a flushed item", () => {
    const next = enqueueJournalItem([], save);
    assert.equal(next.length, 1);
    const attempted = markJournalAttempt(next, "save_1");
    assert.equal(attempted[0]?.attempts, 1);
    assert.equal(itemsReadyToFlush(attempted, 8).length, 1);
    const exhausted = markJournalAttempt(
      [{ ...save, attempts: 7 }],
      "save_1",
    );
    assert.equal(itemsReadyToFlush(exhausted, 8).length, 0);
    assert.equal(dropJournalItem(attempted, "save_1").length, 0);
  });

  it("ignores duplicate ids and junk storage", () => {
    assert.equal(enqueueJournalItem([save], save).length, 1);
    assert.deepEqual(parseJournalQueue("not-json"), []);
    assert.deepEqual(parseJournalQueue("[]"), []);
    assert.equal(
      parseJournalQueue(
        JSON.stringify([{ id: "x", createdAt: 1, attempts: 0, payload: { kind: "save" } }]),
      ).length,
      0,
    );
  });
});
