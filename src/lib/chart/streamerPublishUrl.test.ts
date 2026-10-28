import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountWildcardRoomKey, resolveStreamerPublishUrl } from "./streamerPublishUrl";

describe("resolveStreamerPublishUrl", () => {
  it("sends VPS hosts to /api/internal/chart-publish", () => {
    assert.equal(
      resolveStreamerPublishUrl("https://www.axecompanion.com"),
      "https://www.axecompanion.com/api/internal/chart-publish",
    );
    assert.equal(
      resolveStreamerPublishUrl("https://www.axecompanion.com/"),
      "https://www.axecompanion.com/api/internal/chart-publish",
    );
  });

  it("does not double-append when the path is already set", () => {
    assert.equal(
      resolveStreamerPublishUrl("https://www.axecompanion.com/api/internal/chart-publish"),
      "https://www.axecompanion.com/api/internal/chart-publish",
    );
    assert.equal(
      resolveStreamerPublishUrl("https://chart-edge.workers.dev/internal/publish"),
      "https://chart-edge.workers.dev/internal/publish",
    );
  });

  it("keeps Cloudflare workers on /internal/publish", () => {
    assert.equal(
      resolveStreamerPublishUrl("https://axe-chart-edge.workers.dev"),
      "https://axe-chart-edge.workers.dev/internal/publish",
    );
  });
});

describe("accountWildcardRoomKey", () => {
  it("reaches every open chart and the positions room for an account", () => {
    assert.equal(accountWildcardRoomKey("u1", "a1"), "u1|a1|*");
  });
});
