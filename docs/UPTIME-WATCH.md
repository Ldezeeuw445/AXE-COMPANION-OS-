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

## Targets

Both are checked every two minutes by the `axe-uptime-watch` job:

| Target | Why |
|---|---|
| `https://www.axecompanion.com/robots.txt` | the app itself, served by nginx → Next |
| `https://api.axecompanion.com/health` | AXE Core's API, on the same box |

`ollama.axecompanion.com` is deliberately not watched: it answers nothing, and
chat reaches Ollama over localhost on the same VPS. `chart.axecompanion.com`
is not watched either — the Cloudflare worker is out of free allowance (1027)
and the streamer now pushes straight into the VPS.

## Where the alert goes

An ntfy topic is stored in Vault under `axe_uptime_webhook`: no account to
create, and the phone app turns it into a push. Read the topic with

```sql
select decrypted_secret from vault.decrypted_secrets where name = 'axe_uptime_webhook';
```

and subscribe to it in the ntfy app. pg_net only sends `application/json`, so
ntfy is addressed through its JSON publish endpoint (topic in the body) rather
than the plain-text URL form.

To send somewhere else instead — a Discord channel, say:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'axe_uptime_webhook'),
  'https://discord.com/api/webhooks/…'
);
```

A URL containing `ntfy` is published as an ntfy message, `discord` as
`{"content": …}`, `slack` as `{"text": …}`, anything else gets both keys.

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
