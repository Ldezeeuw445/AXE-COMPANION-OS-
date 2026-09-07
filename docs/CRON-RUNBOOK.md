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
Supabase SQL editor (the value never has to leave that window):

```sql
select vault.create_secret(
  'PASTE_THE_VPS_CRON_SECRET_HERE',
  'axe_companion_cron_secret',
  'Shared bearer for /api/cron/* on the VPS'
);
```

To rotate later, replace it rather than adding a second row:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'axe_companion_cron_secret'),
  'NEW_VALUE'
);
```

## Verifying it works

Fire one job by hand and read the response back:

```sql
select axe_ops.dispatch_cron('manual-check', '/api/cron/krater-feed-sync');
-- then, a second or two later:
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
