# Uptime watch

On 2026-09-23 the VPS was unreachable for over two hours and nothing noticed:
every watcher this app had ran on the machine being watched. The probe
therefore runs in Supabase — off the box, already paid for, and already
running pg_cron.

```
pg_cron (*/2)  →  axe_ops.uptime_check()
                    │  pg_net GET https://www.axecompanion.com/robots.txt
                    │  judges the previous request, then fires the next
                    ▼
              axe_ops.uptime_probe   (every result)
              axe_ops.uptime_state   (outage bookkeeping)
                    │  two failing runs (~3 min)
                    ▼
              axe_ops.uptime_alert() → webhook (Discord / Slack / other)
```

## The one manual step: where the alert goes

Until a webhook exists the outage is still recorded, but nothing shouts. Add
one in the Supabase SQL editor — a Discord channel webhook is the quickest:

```sql
select vault.create_secret(
  'https://discord.com/api/webhooks/…',
  'axe_uptime_webhook',
  'Where uptime alerts go'
);
```

Already there? Replace the value instead of adding a second row:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'axe_uptime_webhook'),
  'https://discord.com/api/webhooks/…'
);
```

A URL containing `discord` is posted as `{"content": …}`, one containing
`slack` as `{"text": …}`, anything else gets both keys.

## Behaviour

- Alerts once per outage, not every two minutes, and once more on recovery
  with how long it was down.
- Three minutes of failure before the first alert: a single missed probe is
  usually a deploy restart, and waking someone for that teaches them to ignore
  the alert.
- A request with no response inside two minutes counts as a failure — which is
  exactly how the September outage looked from outside.

## Checking it by hand

```sql
select * from axe_ops.uptime_probe order by id desc limit 20;
select * from axe_ops.uptime_state;
select axe_ops.uptime_check();   -- one probe now
```
