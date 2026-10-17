# IONOS deploy checklist — October 2026

Use this on the next production ship of `main` via `scripts/deploy-vps.sh`.
Do **not** merge this PR from the agent, do **not** run the deploy from here,
and do **not** apply SQL against live Supabase from an agent session.

Production: `www.axecompanion.com` · host `212.227.91.79` · app
`/root/AXE-COMPANION-OS-` · Next on `:5000` behind nginx · Supabase
`pqnngpcgbdwxavbatbia`.

---

## 0. Before you SSH

1. This PR is green (tsc, lint, `npm test`, `npm run verify`, `test:e2e`,
   `next build`).
2. `main` contains #110 (Claude launch), #112 (C2 shell), #111 (drawings),
   #113 (IONOS prep), plus the waitlist + Ollama resolver work.
3. You have the IONOS SSH key and can edit `/root/AXE-COMPANION-OS-/.env.local`.
4. You can open the Supabase SQL editor for this project (migrations are
   applied there, not by `deploy-vps.sh`).

---

## 1. Unapplied migrations (read-only compare, 2026-10-17)

`supabase_migrations.schema_migrations` on this project is **AXE Core's CLI
history** (versions from `20260707` / `axe_core_agents` through
`20261017114651` / `marketing_waitlist`). None of the files in this repo's
`supabase/migrations/` are recorded there.

Object-level check against the live catalog (re-read 2026-10-17):

| Repo file | Live? |
|---|---|
| `20260329`–`20260703` companion tables/columns (broadcast, onboarding, prefs, intel, journal, billing, …) | **Present** — already applied ad-hoc |
| Distinctive later columns (`favorite_workflow_ids`, `live_trading_enabled`, `chart_theme`, `onboarding_completed_at`, `alert_auto_trade_*`, `conversation_type`) | **Present** |
| `20261017120000_marketing_waitlist.sql` → `public.marketing_waitlist` | **Table present** (AXE Core `20261017114651`, same columns + unique `lower(email)`, RLS on, **no policies**). Anon/authenticated still hold default SELECT/INSERT/UPDATE/DELETE grants — blocked only by RLS. |
| `20261017121000_chart_drawings.sql` → `public.chart_drawings` | **Missing** |

**Apply these two files in the SQL editor (do not skip drawings):**

1. `supabase/migrations/20261017120000_marketing_waitlist.sql` — idempotent.
   `CREATE TABLE IF NOT EXISTS` is a no-op on the live table. The **REVOKE**
   of anon/authenticated/public is the real change: today a
   `DISABLE ROW LEVEL SECURITY` would leak every waitlist email. After this
   file, only `service_role` keeps grants. Landing signups need this **before**
   traffic hits `POST /api/waitlist` (otherwise inserts still work via
   service role, but the grant hole stays).
2. `supabase/migrations/20261017121000_chart_drawings.sql` — the drawings
   client upserts this table.

```bash
# From a trusted machine with the Supabase CLI logged in, or paste the files
# into the SQL editor. Do not skip drawings: the client upserts that table.
```

Confirm:

```sql
select to_regclass('public.chart_drawings');
-- must return public.chart_drawings

select c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'marketing_waitlist';
-- must be true

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'marketing_waitlist'
  and grantee in ('anon', 'authenticated');
-- must return zero rows
```

If you later want Companion migrations tracked in
`schema_migrations`, record `20261017120000` / `marketing_waitlist` and
`20261017121000` / `chart_drawings` in the same transaction. Do not replay
the older companion files.

---

## 2. Env vars on the VPS (`.env.local`)

Restart after any change (`deploy-vps.sh` already restarts). `NEXT_PUBLIC_*`
is baked into the bundle — missing public keys need a rebuild, not just a
restart.

### Required for this launch

| Name | Why |
|---|---|
| `CRON_SECRET` | Bearer for `/api/cron/*`. Must match Vault `axe_companion_cron_secret` byte-for-byte (`docs/CRON-RUNBOOK.md`) |
| `EDGE_SECRET` | Preferred shared secret for `market-proxy` / intel fallbacks. If unset, callers reuse `CRON_SECRET` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push + `/api/push/vapid` |
| `VAPID_PRIVATE_KEY` | Push send |
| `VAPID_SUBJECT` | `mailto:` or `https:` contact for VAPID |
| `STRIPE_SECRET_KEY` | Checkout / portal. Must be a Stripe `sk_…`, not a Supabase secret |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the Stripe webhook |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_FOUNDER` / `STRIPE_PRICE_ELITE` | Price ids |
| `NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO` (and Founder/Elite if used) | Upgrade buttons |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://pqnngpcgbdwxavbatbia.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server routes + smoke freshness |
| `NEXT_PUBLIC_APP_URL` | `https://www.axecompanion.com` |
| `NEXT_PUBLIC_DATA_SOURCE` | `supabase` (or omit if URL+anon are set) |

### Required for jobs that would otherwise 503

| Name | Job |
|---|---|
| `ALPHAVANTAGE_API_KEY` | Host-owned `congress-trades-sync` |
| `METAAPI_TOKEN` | `mt5-sync` |
| `OLLAMA_URL` / `OPENAI_API_KEY` | Chat, journal-sweep, intel-correlate. See “Ollama after this ship” below. |

Same `EDGE_SECRET` (or `CRON_SECRET`) must exist as a **Supabase Edge
secret** for `market-proxy`. See `docs/market-context-providers.md`.

Fingerprint check after restart:

```bash
curl -s https://www.axecompanion.com/api/debug/cron-health
# cron_secret_configured: true
```

```sql
select * from axe_ops.cron_secret_fingerprint();
```

Equal digests ⇒ Vault and `.env.local` match.

### Ollama after this ship (`OLLAMA_URL` comma-list)

The router and `/api/debug/chat-health` now share one parser
(`src/lib/llm/ollamaEndpoints.ts`):

- Read `OLLAMA_URL`, then `OLLAMA_HOST`. `OLLAMA_BASE_URL` is **not** what
  chat uses (that was the old health-check lie).
- Value may be **one URL or a comma/whitespace list**, tried in order.
- The model is a preference: if `OLLAMA_MODEL` is missing on that host, a
  chatable model that is present is chosen. Embedders are never chosen.
- Empty reply = error (router falls through). `think: false` on every call.
- Non-streaming abort is 90s so a Cloudflare 524 (~100s) is not inherited.

**Do not put a comma-list into `.env.local` until this commit is running.**
Older `ollamaClient` treated the whole string as a single URL, so
`https://a,https://b` would  fail every chat until rollback. Sequence:

1. Deploy this code (`./scripts/deploy-vps.sh main`).
2. Confirm `curl -s https://www.axecompanion.com/api/debug/chat-health`
   returns `ollama.configured` / `reachable` booleans only (no URLs).
3. Then edit `.env.local`:

```
OLLAMA_URL=https://ollama.axecompanion.com,https://ollama.tradingosapp.com
```

Leave `OLLAMA_MODEL` unset (both hosts have `llama3.1:8b`; `qwen3:4b` is a
think-model and is missing on the always-on server). Restart
`axe-companion`, then with `CRON_SECRET`:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://www.axecompanion.com/api/debug/chat-health
# status: ok_ollama
# env.ollama_resolved.model: llama3.1:8b  (or whatever that host actually has)
```

A single-URL `OLLAMA_URL` that already works can stay through the deploy;
only the comma-list has to wait until the new process is up.

---

## 3. Replace the host crontab (double-scheduling)

`pg_cron` already owns every Companion job except `congress-trades-sync`
(see `docs/vps-deploy.md`). The old crontab also fired journal-sweep,
intel-correlate, and the original eight jobs.

On the box, after checkout:

```bash
# Review the new file, substitute the real repo path, install it.
sed "s|APP_ROOT|/root/AXE-COMPANION-OS-|g" /root/AXE-COMPANION-OS-/scripts/vps.crontab \
  | crontab -
crontab -l   # only congress-trades-sync should remain as a curl job
```

Do not `cron.schedule` congress-trades from this deploy. If you promote it
later, delete the host line the same day.

---

## 4. nginx WebSocket Upgrade

Without this, Chart stays on SSE. `http` map + both locations (from
`docs/vps-deploy.md`):

```
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

# inside server { ... } for www.axecompanion.com
location / {
  proxy_pass http://127.0.0.1:5000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  proxy_set_header X-Forwarded-For $http_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 86400;
}

location /ws/chart {
  proxy_pass http://127.0.0.1:5000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  proxy_set_header X-Forwarded-For $http_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 86400;
}
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

Same-origin chart WS is `wss://www.axecompanion.com/ws/chart`. Do not set
`NEXT_PUBLIC_CHART_WS_URL` unless Cloudflare `axe-chart-edge` is also live.

---

## 5. Ship the code

On the VPS (this is the only ship path; GitHub does not deploy):

```bash
cd /root/AXE-COMPANION-OS-
./scripts/deploy-vps.sh main
```

That fetches `main`, `npm ci`, `npm run build`, and restarts pm2/systemd.
Node 22 / npm 10 on the box — see `docs/vps-deploy.md` if a lockfile was
written with npm 11.

If `npm run build` is OOM-killed, stop `axe-browser-agent` for the build
(`docs/VPS-RUNBOOK.md`).

Record `git log -1 --oneline` after the script finishes.

---

## 6. Smoke

From a machine that can reach prod (VPS or laptop):

```bash
cd /root/AXE-COMPANION-OS-   # or a local checkout
# Put CRON_SECRET + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
# in .env.smoke (or reuse the host .env.local).
SMOKE_BASE_URL=https://www.axecompanion.com npm run smoke:launch
```

The script is `scripts/smoke-launch.mjs`. It hits homepage, feed, chat,
onboarding, cron 401, optional authenticated cron, and table freshness
(`axe_broadcast_feed`, `axe_daily_briefings`,
`assistant_cockpit_snapshots`).

Also by hand:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://www.axecompanion.com/robots.txt
curl -s -o /dev/null -w "%{http_code}\n" https://www.axecompanion.com/offline
curl -s -o /dev/null -w "%{http_code}\n" https://www.axecompanion.com/manifest.json
curl -sI https://www.axecompanion.com/sw.js | grep -i cache-control
# expect no-cache / no-store
```

On a phone: close the PWA (or tap **Reload** on the update banner), reopen
Chart, overlay badge should read **WS** not **SSE**.

---

## 7. PWA after deploy

A new `sw.js` (`axe-v5`) does **not** auto-activate. Installed clients show
“A new AXE version is ready. Reload…”. Until they tap it they keep the old
bundle — that is intentional so a deploy cannot mix chunks.

Check once: Settings still offers Install (Chrome / Edge / Samsung). iOS
still uses Share → Add to Home Screen.

---

## 8. Rollback

App only (leave `chart_drawings` and the waitlist REVOKEs — both additive):

```bash
cd /root/AXE-COMPANION-OS-
git log --oneline -15          # pick the last known-good main SHA
./scripts/deploy-vps.sh <sha-or-previous-tag>
```

Or `./scripts/deploy-vps.sh main` after a revert commit. SSE
`/api/chart/live` stays as the chart safety net if the socket cannot
upgrade.

If you must undo the crontab change, restore the previous crontab from
`crontab -l` backup you took in step 3. Do not paste the old full job list
back while `pg_cron` is still firing those paths.

Do not drop `public.chart_drawings` as a rollback unless drawings are
broken and you accept losing synced annotations.

---

## Order on the day

1. Apply `20261017120000_marketing_waitlist.sql` (REVOKE) then
   `20261017121000_chart_drawings.sql` in the SQL editor.
2. Confirm/fix `.env.local` (EDGE/CRON, VAPID, Stripe). Leave any
   `OLLAMA_URL` comma-list until after step 5.
3. Snapshot `crontab -l`, install the new `scripts/vps.crontab`.
4. Confirm nginx Upgrade headers; reload if you changed them.
5. `./scripts/deploy-vps.sh main`
6. Only now: set `OLLAMA_URL` to the comma-list if you want both hosts;
   restart; check authenticated `/api/debug/chat-health`.
7. `npm run smoke:launch` + phone WS + PWA reload.
8. If bad: redeploy previous SHA (Rollback below). Leave the waitlist
   REVOKEs and `chart_drawings` table in place — both are additive.
