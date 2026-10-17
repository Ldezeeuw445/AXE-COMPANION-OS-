import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAllowedMime,
  journalAttachmentObjectPath,
  objectPathBelongsToUser,
  ownerIdFromObjectPath,
} from "./attachmentPath";

describe("attachmentPath", () => {
  it("keys the object path by user id then trade id", () => {
    const path = journalAttachmentObjectPath({
      userId: "user-1",
      tradeId: "trade-9",
      attachmentId: "att-3",
      mime: "audio/webm",
    });
    assert.equal(path, "user-1/trade-9/att-3.webm");
    assert.equal(ownerIdFromObjectPath(path), "user-1");
    assert.equal(objectPathBelongsToUser(path, "user-1"), true);
    assert.equal(objectPathBelongsToUser(path, "user-2"), false);
  });

  it("rejects slashes so a client cannot escape its folder", () => {
    assert.throws(() =>
      journalAttachmentObjectPath({
        userId: "user-1/../other",
        tradeId: "t",
        attachmentId: "a",
        mime: "image/png",
      }),
    );
  });

  it("allows voice audio and image mimes only for the matching kind", () => {
    assert.equal(isAllowedMime("voice", "audio/webm"), true);
    assert.equal(isAllowedMime("voice", "image/png"), false);
    assert.equal(isAllowedMime("chart", "image/png"), true);
    assert.equal(isAllowedMime("photo", "application/pdf"), false);
  });
});
