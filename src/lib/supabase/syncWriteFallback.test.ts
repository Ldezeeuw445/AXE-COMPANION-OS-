/**
 * TOS-SEC-2: `syncWriteClient` falls back to the trader's own client when the
 * service-role key is missing. After the revoke that fallback can no longer
 * write, so in production it has to say so — once, not on every sync — and
 * outside production it stays quiet, because there the fallback is the point.
 *
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/supabase/syncWriteFallback.test.ts
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resetSyncWriteFallbackWarning, syncWriteClient } from "./syncWriteClient";

const userClient = { marker: "trader-client" } as unknown as SupabaseClient;
const saved = {
  NODE_ENV: process.env.NODE_ENV,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
};
const env = process.env as Record<string, string | undefined>;

function setEnv(name: keyof typeof saved, value: string | undefined) {
  if (value === undefined) delete env[name];
  else env[name] = value;
}

describe("syncWriteClient fallback", () => {
  let warn: ReturnType<typeof mock.method>;

  beforeEach(() => {
    resetSyncWriteFallbackWarning();
    warn = mock.method(console, "warn", () => {});
  });

  afterEach(() => {
    warn.mock.restore();
    for (const name of Object.keys(saved) as Array<keyof typeof saved>) setEnv(name, saved[name]);
  });

  it("in production, without a service-role key, writes as the trader and warns exactly once", () => {
    setEnv("NODE_ENV", "production");
    setEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");

    assert.equal(syncWriteClient(userClient), userClient);
    assert.equal(syncWriteClient(userClient), userClient);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(String(warn.mock.calls[0].arguments[0]), /SUPABASE_SERVICE_ROLE_KEY.*TOS-SEC-2/);
  });

  it("outside production the fallback is expected and stays quiet", () => {
    setEnv("NODE_ENV", "development");
    setEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);

    assert.equal(syncWriteClient(userClient), userClient);
    assert.equal(warn.mock.callCount(), 0);
  });

  it("with the key configured it goes elevated and says nothing", () => {
    setEnv("NODE_ENV", "production");
    setEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
    setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");

    const client = syncWriteClient(userClient);
    assert.notEqual(client, userClient);
    assert.equal(typeof client.from, "function");
    assert.equal(warn.mock.callCount(), 0);
  });
});
