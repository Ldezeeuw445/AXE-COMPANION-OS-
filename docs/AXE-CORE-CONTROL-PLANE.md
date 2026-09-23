# Keys and schedules, managed from AXE Core

Two things lived in too many places at once: **keys** (this box's
`.env.local`, AXE Core's env on the same box, Supabase Edge secrets, and
several present-but-empty after the Vercel move) and **schedules** (pg_cron
fired them, but only recorded that the SQL ran — never what the app answered,
which is how the broadcast feed stayed dead for two months while every
dashboard was green).

Both now have one home in Supabase, where AXE Core and Companion already meet.

## Keys

```
AXE Core UI  ──►  public.axe_set_app_secret(app, key, value, description)
                        │  value → vault.secrets (encrypted)
                        │  pointer → axe_ops.app_secret (app, key, vault_id)
                        ▼
Companion boot ──►  public.axe_get_app_secrets('companion')
                        └─► process.env, unless the box already set it
```

| Function | For |
|---|---|
| `axe_set_app_secret(app, key, value, description)` | write / rotate |
| `axe_get_app_secrets(app)` | an app loading its own keys |
| `axe_list_app_secrets(app)` | inventory for a screen — names and `is_set`, never values |
| `axe_delete_app_secret(app, key)` | remove from registry and Vault |

All four are `service_role` only: `anon` and `authenticated` cannot call them,
so a browser can never ask the database for a provider key.

Companion loads them in `instrumentation.ts` at boot and exposes
`POST /api/internal/keystore-reload` (CRON_SECRET) so a rotated key takes
effect without a deploy. Names are returned, values never.

**What cannot come from the keystore, by nature:**

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` —
  they are what opens the keystore.
- Anything `NEXT_PUBLIC_*` — Next inlines those into the browser bundle at
  build time, so they cannot be supplied at runtime. The Stripe payment links
  stay env + deploy.
- Supabase Edge secrets (`intel-proxy`) — Edge functions read their own
  environment; pointing them here is a separate change inside that function.

An env var that is already set wins over the keystore. That is deliberate: the
box stays the final authority, and a local override is never silently replaced.

## Schedules

```
axe_ops.cron_job   — what should run, where, how often, and who owns it
axe_ops.cron_run   — every execution: status, duration, what the app answered
public.axe_cron_status('companion') — one row per job, for AXE Core
```

`axe_ops.collect_cron_runs()` (every minute) joins each dispatch to its
`net._http_response` and judges the body as well as the status code: a 200
whose JSON says `"status":"failed"`, `"ok":false` or `not configured` is
recorded as a failure. That is the check that was missing.

`owner` is `pg_cron` today. When AXE Core's worker takes a job over, set it to
`axe_core`, have the worker write its own `cron_run` rows with
`triggered_by = 'axe_core'`, and unschedule that job from pg_cron. Both can
coexist during the switch — the registry is the truth about who owns what.
