# Deploy AXE Companion on the IONOS VPS

Production is `www.axecompanion.com` — Ubuntu + nginx → Next on port 5000.
This script is the only ship path.

## Ship a branch (run on the server)

SSH into `212.227.91.79`, then:

```bash
cd /path/to/AXE-COMPANION-OS-
./scripts/deploy-vps.sh cursor/chart-websocket-live-c844
```

After this branch is on `main`:

```bash
./scripts/deploy-vps.sh main
```

That fetches the ref, `npm ci`, `npm run build`, and restarts via pm2/systemd when those names exist.

Deploy does **not** happen from GitHub. This agent cannot SSH into `212.227.91.79` (no key). The live site only updates when someone runs the script on that machine.

## nginx must upgrade WebSockets

Without this, the chart stays on SSE. Put the map in the `http` block, then proxy Next:

```
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

server {
  # ... existing TLS / server_name www.axecompanion.com ...

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
}
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

Same-origin chart WS is `wss://www.axecompanion.com/ws/chart`. You do **not** need `NEXT_PUBLIC_CHART_WS_URL` unless you also run Cloudflare `axe-chart-edge`.

## Who owns cron

Read-only check on 2026-10-17 against `cron.job` and `axe_ops.cron_job` on
project `pqnngpcgbdwxavbatbia`. **One scheduler owns each job.** Prefer the
copy that is already live in `pg_cron`; the IONOS crontab only keeps jobs that
are not registered there.

| Job | Route | Owner | Why |
|---|---|---|---|
| `mt5-sync` | `/api/cron/mt5-sync` | **pg_cron** (`axe-companion-mt5-sync`) | Live, active |
| `axe-watcher` | `/api/cron/axe-watcher` | **pg_cron** | Live, active |
| `intel-warmup` | `/api/cron/intel-warmup` | **pg_cron** | Live, active |
| `daily-briefing` | `/api/cron/daily-briefing` | **pg_cron** | Live, active |
| `weekly-briefing` | `/api/cron/weekly-briefing` | **pg_cron** | Live, active |
| `cockpit-snapshots` | `/api/cron/cockpit-snapshots` | **pg_cron** | Live, active |
| `knowledge-sync` | `/api/cron/knowledge-sync` | **pg_cron** | Live, active |
| `intel-correlate` | `/api/cron/intel-correlate` | **pg_cron** | Live, active (Claude launch) |
| `journal-sweep` | `/api/cron/journal-sweep` | **pg_cron** | Live, active (Claude launch) |
| `user-knowledge-sync` | `/api/cron/user-knowledge-sync` | **pg_cron** | Live, active; never was in the host crontab |
| `congress-trades-sync` | `/api/cron/congress-trades-sync` | **IONOS crontab** | Documented in `docs/CRON-RUNBOOK.md` but **not** in live `cron.job` / `axe_ops.cron_job` |

`scripts/vps.crontab` therefore contains only `congress-trades-sync`. After a
deploy, **replace** the host crontab with that file (substitute `APP_ROOT`) so
the old duplicate lines for journal-sweep / intel-correlate / the original
eight jobs do not keep firing next to `pg_cron`. Keep `CRON_SECRET` in
`.env.local` — `pg_cron` still needs the same value in Vault
(`axe_companion_cron_secret`) and the host job still sends it as Bearer.

Do **not** `cron.schedule` congress-trades-sync from this PR. If you later
promote it to `pg_cron`, delete the host line the same day.

Health: `select * from axe_ops.cron_health;` and
`curl -s https://www.axecompanion.com/api/debug/cron-health`. Full dispatch
path is in `docs/CRON-RUNBOOK.md`.

## Check on the phone

1. Hard-refresh or close and reopen the PWA.
2. Open Chart on an MT5 cloud account.
3. The compact overlay badge should read **WS**, not **SSE**.

If it still says SSE: confirm nginx Upgrade headers, then `ss -tlnp | grep 5000` and that the running Next process is this branch (`git log -1 --oneline`).

## Rollback

On the VPS:

```bash
./scripts/deploy-vps.sh main
```

(or the previous known-good commit). SSE `/api/chart/live` stays as the safety net if the socket cannot upgrade.

## Install dependencies with npm 10

The VPS runs Node 22 / npm 10 and deploys with `npm ci`, which refuses a tree
that does not match the lock. npm 11 (Node 24) writes a lock without entries
npm 10 expects — `@base-org/account`, `ox`, `zustand` and the rest of the wagmi
tree — and the deploy then stops at install, before the build. If your machine
runs npm 11, add packages with:

```bash
npx npm@10.9.8 install <pkg>
npx npm@10.9.8 ci   # verify the lock the way the VPS will
```

## Leftover dashboard steps (Luka only)

These cannot be changed from this repo:

1. **GitHub repo homepage.** Settings → General → Website is still `https://axe-companion-os.vercel.app`. Set it to `https://www.axecompanion.com`.
2. **Vercel GitHub App.** Disconnect it at GitHub → repo Settings → Integrations → Vercel. Leftover checks ("Account is blocked") come from that old link and can block PRs.
3. **Vercel dashboard.** Archive or delete the old Companion project if it still exists. Only Luka can do that in the Vercel account.
