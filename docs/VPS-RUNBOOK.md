# AXE Companion — VPS runbook

The deploy target, written down because it was not documented anywhere and that
cost a session to rediscover.

## The box

| | |
|---|---|
| Host | IONOS Cloud, France (`fr-nbz-ionos-cloud-nbz`) |
| IP | `212.227.91.79` · `ip212-227-91-79.pbiaas.com` |
| SSH | `ssh root@api.axecompanion.com` |
| OS | Ubuntu 24.04 LTS · Node v22.23.1 · nginx 1.24.0 |
| App path | `/root/AXE-COMPANION-OS-` |
| Deployed branch | `main` |
| Autodeploy | cron every 5 min · `/var/log/axe-autodeploy.log` |
| Service | `axe-companion.service` |
| Log | `/var/log/axe-companion.log` |
| Memory cap | `MemoryMax=3G` |

`nginx` fronts four names: `axecompanion.com`, `api.axecompanion.com`,
`ollama.axecompanion.com`, `default`.

The box also runs `axe-core-api`, `axe-task-worker`, `axe-browser-agent`,
`axe-terminal` and `axe-tunnel-relay`. It was sitting at 79% memory and 46% swap
with all of them up, so a Companion build competes for RAM — see *Building* below.

## How the app starts

```ini
WorkingDirectory=/root/AXE-COMPANION-OS-
ExecStart=/usr/local/bin/npm start      # next start -p 5000 -H 0.0.0.0
Restart=always
```

There is no `EnvironmentFile`: `next start` reads `/root/AXE-COMPANION-OS-/.env.local`
itself, and that file is the single source of truth for app-side configuration.
Changing it therefore requires a service restart, not just a rebuild.

## Deploying

Pushing to `main` is the deploy. A cron pulls, builds and restarts every five
minutes; `scripts/install-autodeploy.sh main` is what put it there, and it logs
to `/var/log/axe-autodeploy.log`. Measured end to end on 2026-10-20: pushed at
19:16, built at 19:21:21, serving at 19:22:39 — about six minutes, unattended.

**This table said `deployed` for weeks and the box was on `main` the whole
time.** Four pushes to `deployed` reached nobody, and nothing said so, because
a build that fails restarts nothing and the old process keeps serving quite
happily. So do not trust this page either — ask production:

```bash
curl -s https://www.axecompanion.com/api/debug/build
```

```json
{"commit":"0f0e647…","shortCommit":"0f0e647","branch":"main",
 "builtAt":"2026-10-20T19:31:30.507Z","ageSeconds":770,"now":"…"}
```

That is the only answer that counts: the commit actually serving, the branch it
came from, and how long ago it was built. Compare `shortCommit` against
`git rev-parse --short HEAD`. A stale `builtAt` with a new commit on `main`
means the build is failing — read the autodeploy log.

By hand, when the cron is wedged:

```bash
cd /root/AXE-COMPANION-OS-
git fetch origin main
git merge --ff-only origin/main
npm ci
npm run build
systemctl restart axe-companion
curl -s https://www.axecompanion.com/api/debug/build
```

### Building on a full box

`npm run build` on top of Ollama, the API and the workers can hit the 3G cap.
If the build is killed, stop the heaviest neighbour for the duration:

```bash
systemctl stop axe-browser-agent
npm run build
systemctl start axe-browser-agent
```

## Where each key lives

The two stores are not interchangeable and nothing in the code bridges them.

- **`/root/AXE-COMPANION-OS-/.env.local`** — everything the Next app does:
  `OPENAI_API_KEY`, `OLLAMA_*`, `STRIPE_*`, `KRATER_*`, `ALPACA_*`,
  `METAAPI_TOKEN`, `VAPID_*`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Supabase → Edge Functions → Secrets** — only `intel-proxy` and
  `market-proxy` can read these: `UNUSUAL_WHALES_TOKEN`, `FINNHUB_API_KEY`,
  `FRED_API_KEY`, `EIA_API_KEY`, `GREYNOISE_API_KEY`, `AISSTREAM_API_KEY`,
  `RAPIDAPI_KEY`, `OPENSKY_*`, `QUIVER_API_KEY`, `FMP_API_KEY`.

`.env.local` currently holds Intel keys too. They do nothing there — the Edge
functions cannot see them. Either mirror them into Edge secrets or accept that
those feeds run on whatever Supabase holds.

`getMergedEdgeEnv` also accepts one JSON blob, so all of them can go in as a
single Edge secret named `EDGE_PROVIDER_KEYS_JSON` instead of ten separate ones.

## Comparing the cron secret across both sides

`CRON_SECRET` has to be byte-identical in `.env.local` and in Supabase Vault
(`axe_companion_cron_secret`). Every `/api/cron/*` route answers `401` both when
it is missing and when it is wrong, so compare digests rather than guessing —
neither side reveals the value:

```bash
curl -s https://www.axecompanion.com/api/debug/cron-health     # host side
```
```sql
select * from axe_ops.cron_secret_fingerprint();               -- Vault side
```

Equal fingerprints mean equal strings. A 404 from `/api/debug/cron-health`
means the host is on older code — check `/api/debug/build` to see how old.

## Settled

- **`src/app/migrations/page.tsx` leaking `MIGRATION_SECRET`.** The page
  rendered the secret verbatim in its "example URL" block to any anonymous
  visitor. The page and `/api/internal/migrate` are both deleted from `main`;
  there is no `MIGRATION_SECRET` reference left in `src/`. Verified
  2026-10-20.
- **No way to tell what was deployed.** `/api/debug/build`, above.
