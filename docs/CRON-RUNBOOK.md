# AXE Companion — cron runbook (VPS + pg_cron)

Production runs on the VPS, not Vercel. `vercel.json` is therefore dead config:
Vercel Cron only fires for apps deployed on Vercel, which is why the broadcast
feed stopped on 2026-07-06 and the briefings on 2026-07-18.

Scheduling now lives inside Supabase, using the same `pg_cron` + `pg_net`
mechanism AXE Core already uses for its two memory jobs. That is deliberate:
it survives a VPS restart, it does not depend on the owner's Mac being awake,
and AXE Core can manage it as the ecosystem's cron manager.

```
pg_cron (Supabase)  ──►  axe_ops.dispatch_cron(job, path)
                              │  reads CRON_SECRET from Supabase Vault
                              ▼
                    pg_net  ──► https://www.axecompanion.com/api/cron/<job>
                                Authorization: Bearer <CRON_SECRET>
```

## One remaining step: the shared secret

`dispatch_cron` reads the secret from Vault under the name
`axe_companion_cron_secret`. Until it exists, every job logs a skip and makes no
network call — nothing breaks, nothing runs.

Insert the **same value** that `CRON_SECRET` has on the VPS. Run this in the
Supabase SQL editor (the value never has to leave that window).

> **Replace the whole quoted string, angle brackets included.** They are a
> placeholder, not syntax. Pasting `'<CRON_SECRET van je VPS>'` verbatim stores
> that text as the secret, Vault returns an id as if it worked, and every job
> then fails with a plain `401` that looks exactly like a wrong key.
> `dispatch_cron` now detects that shape and reports
> `vault_secret_is_placeholder:` in `cron_health` instead of calling the app.

```sql
select vault.create_secret(
  'PASTE_THE_VPS_CRON_SECRET_HERE',
  'axe_companion_cron_secret',
  'Shared bearer for /api/cron/* on the VPS'
);
```

If a secret already exists under that name — including a placeholder — do **not**
run `create_secret` again; that adds a second row. Replace the value instead:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'axe_companion_cron_secret'),
  'NEW_VALUE'
);
```

## Verifying it works

Fire one job by hand and read the response back:

The Supabase SQL editor only renders the result of the **last** statement, so
run these as two separate executions or the HTTP result is hidden by whatever
follows it:

```sql
select axe_ops.dispatch_cron('manual-check', '/api/cron/krater-feed-sync');
```

```sql
select status_code, left(content, 300)
from net._http_response
order by id desc
limit 1;
```

`401 {"error":"unauthorized"}` means the secret does not match the VPS.
`200` means the chain is live.

Then confirm the data actually lands:

```sql
select max(created_at) from axe_broadcast_feed;   -- should move within 10 min
select max(created_at) from axe_daily_briefings;  -- should move within a day
```

## Is the secret the same on both sides?

Every `/api/cron/*` route answers `401` both when `CRON_SECRET` is missing on the
host and when the caller's value is wrong. From outside those are
indistinguishable and they need opposite fixes, so compare the two sides
directly. Neither reveals the secret — they return the same non-reversible
digest, and equal digests mean equal strings.

Vault side:

```sql
select * from axe_ops.cron_secret_fingerprint();
```

Host side:

```bash
curl -s https://www.axecompanion.com/api/debug/cron-health
```

Read it like this:

| What you see | What it means |
|---|---|
| `cron_secret_configured: false` | The VPS has no `CRON_SECRET`. No value in Vault will ever work — set it on the host first. |
| Both configured, **different** fingerprints | Two different strings. Copy the host's value into Vault. |
| Both configured, **same** fingerprint | They match. A remaining 401 is something else. |
| `had_surrounding_whitespace: true` | The host's value has stray whitespace the routes compare literally. |

The digest implementations were checked against each other: `hello` gives
`4f9f2cab2e558763` on both sides.

> `/api/debug/cron-health` only exists once the host runs a build that contains
> it. If it 404s, production is still on older code.

## Day-to-day health

```sql
select * from axe_ops.cron_health;
```

One row per job with its schedule, last dispatch, last skip reason, and the last
HTTP status the VPS returned. The two-month outage was invisible precisely
because nothing reported it — this is the thing to check first when a feed looks
stale.

## The nine jobs

| Job | Schedule (UTC) | Route |
|---|---|---|
| `axe-companion-mt5-sync` | `*/10 * * * *` | `/api/cron/mt5-sync` |
| `axe-companion-axe-watcher` | `*/15 * * * *` | `/api/cron/axe-watcher` |
| `axe-companion-intel-warmup` | `*/30 * * * *` | `/api/cron/intel-warmup` |
| `axe-companion-daily-briefing` | `*/15 4-11 * * *` | `/api/cron/daily-briefing` |
| `axe-companion-weekly-briefing` | `*/15 4-11 * * 1` | `/api/cron/weekly-briefing` |
| `axe-companion-cockpit-snapshots` | `30 6 * * *` | `/api/cron/cockpit-snapshots` |
| `axe-companion-knowledge-sync` | `0 5 * * 0` | `/api/cron/knowledge-sync` |
| `axe-companion-krater-feed-sync` | `*/10 4-20 * * *` | `/api/cron/krater-feed-sync` |
| `axe-companion-intel-correlate` | `5 * * * *` | `/api/cron/intel-correlate` |

The first eight carry the exact schedules `vercel.json` used, already written in
UTC. `intel-correlate` is new here: its route has always existed but was never
in `vercel.json`, so it would not have run even on Vercel.

## Moving hosts

The base URL is one row, not nine job definitions:

```sql
update axe_ops.cron_target set base_url = 'https://new-host.example', updated_at = now();
```

## Retiring vercel.json

`vercel.json` is kept only so the crons are documented in one more place. It has
no effect on the VPS. Delete it once you are sure you will not return to Vercel.
