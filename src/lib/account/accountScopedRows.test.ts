import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountIdForUpsertRow,
  accountIdReadOrFilter,
  accountIdWriteValue,
  applyAccountIdReadFilter,
  loadActiveAccountId,
  normalizeAccountId,
  rowMatchesActiveAccount,
} from "./accountScopedRows";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";

describe("normalizeAccountId", () => {
  it("keeps a uuid", () => {
    assert.equal(normalizeAccountId(ACCOUNT_A), ACCOUNT_A);
  });

  it("trims whitespace", () => {
    assert.equal(normalizeAccountId(`  ${ACCOUNT_A}  `), ACCOUNT_A);
  });

  it("rejects empty, missing, or non-uuid values", () => {
    assert.equal(normalizeAccountId(null), null);
    assert.equal(normalizeAccountId(undefined), null);
    assert.equal(normalizeAccountId(""), null);
    assert.equal(normalizeAccountId("acct-1"), null);
    assert.equal(normalizeAccountId("11111111-1111-4111-8111-11111111111"), null);
  });
});

describe("accountIdWriteValue", () => {
  it("stamps the active trading account on create", () => {
    assert.equal(accountIdWriteValue(ACCOUNT_A), ACCOUNT_A);
  });

  it("writes null when no account is active (today's behaviour)", () => {
    assert.equal(accountIdWriteValue(null), null);
    assert.equal(accountIdWriteValue(undefined), null);
    assert.equal(accountIdWriteValue(""), null);
  });
});

describe("accountIdReadOrFilter", () => {
  it("returns a PostgREST or-filter for the active account plus NULL (legacy every-account rows)", () => {
    assert.equal(
      accountIdReadOrFilter(ACCOUNT_A),
      `account_id.eq.${ACCOUNT_A},account_id.is.null`,
    );
  });

  it("returns null when no account is active so callers skip the extra filter", () => {
    assert.equal(accountIdReadOrFilter(null), null);
    assert.equal(accountIdReadOrFilter(undefined), null);
    assert.equal(accountIdReadOrFilter("not-a-uuid"), null);
  });
});

describe("applyAccountIdReadFilter", () => {
  it("does not call or() when no account is active", () => {
    const calls: string[] = [];
    const query = {
      or(filter: string) {
        calls.push(filter);
        return this;
      },
    };
    const result = applyAccountIdReadFilter(query, null);
    assert.equal(result, query);
    assert.equal(calls.length, 0);
  });

  it("adds account_id.eq + is.null when an account is active", () => {
    const calls: string[] = [];
    const query = {
      or(filter: string) {
        calls.push(filter);
        return this;
      },
    };
    const result = applyAccountIdReadFilter(query, ACCOUNT_A);
    assert.equal(result, query);
    assert.deepEqual(calls, [`account_id.eq.${ACCOUNT_A},account_id.is.null`]);
  });
});

describe("rowMatchesActiveAccount", () => {
  it("shows every row when no account is active", () => {
    assert.equal(rowMatchesActiveAccount(ACCOUNT_A, null), true);
    assert.equal(rowMatchesActiveAccount(null, null), true);
    assert.equal(rowMatchesActiveAccount(ACCOUNT_B, undefined), true);
  });

  it("shows the active account's rows and NULL (every-account) rows", () => {
    assert.equal(rowMatchesActiveAccount(ACCOUNT_A, ACCOUNT_A), true);
    assert.equal(rowMatchesActiveAccount(null, ACCOUNT_A), true);
    assert.equal(rowMatchesActiveAccount(undefined, ACCOUNT_A), true);
    assert.equal(rowMatchesActiveAccount("", ACCOUNT_A), true);
  });

  it("hides rows stamped to a different account", () => {
    assert.equal(rowMatchesActiveAccount(ACCOUNT_B, ACCOUNT_A), false);
  });
});

describe("accountIdForUpsertRow", () => {
  it("stamps the active account on a new row", () => {
    assert.equal(accountIdForUpsertRow(null, ACCOUNT_A), ACCOUNT_A);
  });

  it("leaves a new row null when no account is active", () => {
    assert.equal(accountIdForUpsertRow(null, null), null);
  });

  it("preserves an existing row's account_id, including legacy NULL", () => {
    assert.equal(accountIdForUpsertRow({ account_id: ACCOUNT_B }, ACCOUNT_A), ACCOUNT_B);
    assert.equal(accountIdForUpsertRow({ account_id: null }, ACCOUNT_A), null);
  });
});

describe("loadActiveAccountId", () => {
  it("reads user_workspace_preferences.active_account_id", async () => {
    const tables: string[] = [];
    const supabase = {
      from(table: string) {
        tables.push(table);
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return { data: { active_account_id: ACCOUNT_A } };
          },
        };
      },
    };
    const id = await loadActiveAccountId(supabase, "user-1");
    assert.equal(id, ACCOUNT_A);
    assert.deepEqual(tables, ["user_workspace_preferences"]);
  });

  it("returns null when the workspace has no active account", async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return { data: { active_account_id: null } };
          },
        };
      },
    };
    assert.equal(await loadActiveAccountId(supabase, "user-1"), null);
  });
});
