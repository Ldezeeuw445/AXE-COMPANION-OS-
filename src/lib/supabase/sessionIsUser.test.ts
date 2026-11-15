/**
 * TOS-SEC-2: `sessionIsUser` is the only ownership check in front of the
 * elevated inserts in `demoAccountProvision.ts` and `alpaca/provision.ts`. Once those go
 * out on the service-role client RLS no longer compares `user_id` to the
 * session, so this has to say no in every case where RLS would have.
 *
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/supabase/sessionIsUser.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionIsUser } from "./syncWriteClient";

function clientWithSession(user: { id: string } | null, calls?: { n: number }): SupabaseClient {
  return {
    auth: {
      async getUser() {
        if (calls) calls.n += 1;
        return { data: { user }, error: user ? null : { message: "Auth session missing!" } };
      },
    },
  } as unknown as SupabaseClient;
}

describe("sessionIsUser", () => {
  it("is true only for the signed-in user", async () => {
    assert.equal(await sessionIsUser(clientWithSession({ id: "user-a" }), "user-a"), true);
  });

  it("refuses another trader's id", async () => {
    assert.equal(await sessionIsUser(clientWithSession({ id: "user-a" }), "user-b"), false);
  });

  it("refuses when nobody is signed in", async () => {
    assert.equal(await sessionIsUser(clientWithSession(null), "user-a"), false);
  });

  it("refuses an empty id without asking auth, so '' never matches a missing user", async () => {
    const calls = { n: 0 };
    assert.equal(await sessionIsUser(clientWithSession({ id: "" }, calls), ""), false);
    assert.equal(calls.n, 0);
  });
});
