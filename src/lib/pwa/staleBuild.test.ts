import assert from "node:assert/strict";
import test from "node:test";
import { fetchServerBuildCommit, isDifferentBuild, isStaleBuildError, mayReloadNow } from "./staleBuild";

test("recognises the errors a stale bundle produces (18 Nov, Luka's phone)", () => {
  assert.equal(isStaleBuildError("Failed to load chunk /_next/static/chunks/128fv6d59873w.js from module 964893"), true);
  assert.equal(
    isStaleBuildError('Server Action "6058f07a7256861322c77725ff7e95b5b3bff9eb7b" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'),
    true,
  );
  assert.equal(isStaleBuildError(new Error("ChunkLoadError: Loading chunk 42 failed.")), true);
  assert.equal(isStaleBuildError("Importing a module script failed."), true);
  assert.equal(isStaleBuildError("TypeError: Failed to fetch dynamically imported module: https://x/y.js"), true);
});

test("leaves every other error alone", () => {
  assert.equal(isStaleBuildError("MetaAPI account-information 504"), false);
  assert.equal(isStaleBuildError("Cannot read properties of undefined (reading 'equity')"), false);
  assert.equal(isStaleBuildError(""), false);
  assert.equal(isStaleBuildError(undefined), false);
});

test("compares builds on seven characters and never on an unknown commit", () => {
  assert.equal(isDifferentBuild("013112aa8a3a73e2", "1fb15c6"), true);
  assert.equal(isDifferentBuild("013112aa8a3a73e2", "013112a"), false);
  assert.equal(isDifferentBuild("", "013112a"), false);
  assert.equal(isDifferentBuild("013112a", null), false);
});

test("reloads at most once a minute", () => {
  const now = 1_800_000_000_000;
  assert.equal(mayReloadNow(null, now), true);
  assert.equal(mayReloadNow(String(now - 10_000), now), false);
  assert.equal(mayReloadNow(String(now - 61_000), now), true);
});

test("reads the serving commit from /api/debug/build without cache, null when it cannot", async () => {
  let init: RequestInit | undefined;
  const ok = (async (_u: unknown, i?: RequestInit) => {
    init = i;
    return new Response(JSON.stringify({ commit: "013112aa8a3a" }), { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(await fetchServerBuildCommit(ok), "013112aa8a3a");
  assert.equal(init?.cache, "no-store");
  assert.equal(await fetchServerBuildCommit((async () => new Response("x", { status: 502 })) as unknown as typeof fetch), null);
  assert.equal(await fetchServerBuildCommit((async () => { throw new Error("offline"); }) as unknown as typeof fetch), null);
});
