# TOS-SEC-2 — revoking the trader's write grants

**Status: not yet applied.** Nobody has run the statement below. When it is run,
replace this line with the date and project ref, the way the two earlier grant
migrations do (`supabase/migrations/20261017220000_tighten_push_journal_grants.sql`).

## What this is for

Three tables are owned by the MT5 sync rather than by the trader:

| Table | What it holds | Why the trader must not write it |
|---|---|---|
| `broker_trades` | the closed-trade ledger | this is the P&L AXE scores a trader on. A trader who can write it can rewrite their own score |
| `mt5_positions` | open positions, replaced each sync | risk guards read it: an invented position moves the daily-loss and drawdown maths |
| `user_broker_accounts` | account rows, incl. `provider_status`, `hub_status`, `metadata` | `metadata` carries the MetaApi account summary the ledger reconciles against |

Every trader held INSERT and UPDATE on all three, with row-level security as the
only thing narrowing it to their own rows. Those grants existed because a
background job used the trader's own client to do its writing — not because any
trader-facing feature needed them.

That is what `syncWriteClient` moved: the sync now writes with the service-role
client, after reading ownership through the caller's own RLS-scoped client and
with `user_id` still filtered on every write. See `src/lib/supabase/syncWriteClient.ts`
for the two rules, and `src/lib/mt5/syncWriteScope.test.ts` for the tests that
hold every call site to them.

With that done, the grants below are no longer load-bearing.

## Before you run it

**`SUPABASE_SERVICE_ROLE_KEY` must be set on the host.** This is the one
precondition that can turn the revoke into an outage. `syncWriteClient` falls
back to the caller's own client when no service-role key is configured — which
is deliberate, so local and preview environments keep working. Once these grants
are gone, that fallback no longer *can* work: the sync would fail its writes
instead of degrading. Check the key is present on the VPS first.

A production process that takes the fallback logs it once, at the first sync:
`[sync-write] SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing`.
If that line is in the host's log, do not run the revoke.

## The statement

Idempotent, like the earlier grant migrations — safe to re-run, and safe to run
one table at a time.

```sql
-- broker_trades: the sync writes it elevated. DELETE stays, because removing an
-- account clears its own trade history (src/app/actions/brokerAccounts.ts).
revoke insert, update on public.broker_trades from authenticated;

-- mt5_positions: written only by the elevated sync, which replaces the whole
-- set per account (delete-then-insert in src/lib/mt5/persistLiveAccount.ts).
-- Nothing a trader does touches this table directly.
revoke insert, update, delete on public.mt5_positions from authenticated;

-- user_broker_accounts: INSERT and DELETE stay — adding an EA-linked account by
-- hand and removing it are the owner acting on their own row. UPDATE was the
-- provider/sync state, and the last holdout (the hub adapter's saveAccount) now
-- goes out elevated too.
revoke update on public.user_broker_accounts from authenticated;
```

`select` is untouched on all three. Every one of these tables is read on the
trader's client — the account list, the ledger, open positions — and RLS is what
scopes those reads.

## Afterwards

What the trader's role should be left holding:

```sql
select table_name, privilege_type
  from information_schema.role_table_grants
 where grantee = 'authenticated'
   and table_schema = 'public'
   and table_name in ('broker_trades', 'mt5_positions', 'user_broker_accounts')
 order by table_name, privilege_type;
```

Expected, and nothing else:

| Table | Left |
|---|---|
| `broker_trades` | SELECT, DELETE |
| `mt5_positions` | SELECT |
| `user_broker_accounts` | SELECT, INSERT, DELETE |

Then exercise the paths that would notice: connect an MT5 account, let one sync
run and check a trade lands in the journal, open and close a paper position,
rename an account, and remove one.

## Rolling back

```sql
grant insert, update on public.broker_trades to authenticated;
grant insert, update, delete on public.mt5_positions to authenticated;
grant update on public.user_broker_accounts to authenticated;
```

RLS policies are untouched by any of this, so a rollback restores exactly the
previous behaviour.

## Why this file is not a migration

A push to `main` that touches `supabase/migrations/**` applies to the live
project automatically (`.github/workflows/apply-supabase-migrations.yml`). A
revoke that breaks a write is only visible when a trader hits that write, so
this one wants a human choosing the moment, not a merge.

`src/lib/mt5/revokeGrantPlan.test.ts` parses the SQL above and checks it against
a scan of `src`, both ways: nothing revoked that a trader-client statement still
uses, and nothing left granted that nothing uses. So this file cannot quietly go
stale — if someone adds a write, the suite says so and names it.
