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
| Deployed branch | `deployed` (not `main`) |
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

```bash
cd /root/AXE-COMPANION-OS-
git fetch origin
git checkout deployed
git merge --ff-only origin/<branch-to-ship>   # or: git reset --hard origin/<branch>
npm ci
npm run build
systemctl restart axe-companion
systemctl status axe-companion --no-pager | head -5
```

Then confirm the running code is actually the new code — a build that fails
leaves the old process happily serving:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://www.axecompanion.com/robots.txt
```

`200` means the deploy landed (that route only exists from the audit branch
onward). `404` means it did not.

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

Equal fingerprints mean equal strings. `/api/debug/cron-health` exists only from
the audit branch onward; a 404 means the host is on older code.

## One thing to fix before the next rebuild

`src/app/migrations/page.tsx` renders `MIGRATION_SECRET` verbatim to any
anonymous visitor, in its "example URL" block. `MIGRATION_SECRET` **is** set in
`.env.local`. The live page happens to render it empty today, so nothing is
leaking right now, but the code path is there and a rebuild could start showing
it. The audit branch deletes that page and `/api/internal/migrate` outright —
which is a reason to ship that branch rather than `main`.
