# MetaApi Streamer — production deploy

The streamer pushes **real-time** MetaAPI ticks to Cloudflare ChartLiveRoom (`WORKER_MODE=push`).
Without it, the chart falls back to poll mode (~1–2.5s delay) or SSE.

## 1. Deploy streamer (Railway — geen Root Directory)

Volledige handleiding: **`docs/railway-streamer-setup-nl.md`**

Kort:

1. Nieuw Railway-project → Deploy from GitHub → `AXE-COMPANION-OS-`
2. Service → Settings → **Config file path:** `/node/metaapi-streamer/railway.json`
3. Variables invullen (zie tabel hieronder)
4. Redeploy

De repo bevat `Dockerfile.streamer` in de root — Railway hoeft geen Root Directory te kennen.

| Variable | Value |
|----------|--------|
| `METAAPI_TOKEN` | Same as IONOS Next `.env.local` |
| `WORKER_URL` | `https://<your-chart-edge>.workers.dev` |
| `STREAMER_SECRET` | Random secret (match Cloudflare) |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `PORT` | `8080` (Railway sets automatically) |

Health check: `GET /health` → `{ ok: true, streams: N }`

## 2. Switch Cloudflare Worker to push mode

```bash
cd cloudflare/chart-edge
npx wrangler secret put STREAMER_SECRET   # same value as Railway
# Edit wrangler.toml: WORKER_MODE = "push"
npx wrangler deploy
```

## 3. IONOS Next env (already required for WS)

Same-origin `/ws/chart` is the default. Set Cloudflare vars only if that worker is used.

| Variable | Purpose |
|----------|---------|
| `CHART_SESSION_JWT_SECRET` | WS session tokens (Cloudflare hop) |
| `NEXT_PUBLIC_CHART_WS_URL` | `wss://<chart-edge>/ws/chart` (optional) |
| `CRON_SECRET` | Background MT5 sync cron |
| `SUPABASE_SERVICE_ROLE_KEY` | Cron + streamer |
| `NEXT_PUBLIC_APP_URL` | `https://www.axecompanion.com` |

## 4. Background MT5 sync

Host crontab (`scripts/vps.crontab`) hits `/api/cron/mt5-sync` every 10 minutes.
Set `CRON_SECRET` on the IONOS host — `scripts/run-vps-cron.sh` sends `Authorization: Bearer <CRON_SECRET>`.

Journal page also triggers a stale sync when `last_sync_at` is older than 10 minutes.

## Verify

1. Railway logs: `Found N account(s)` + `Heartbeat: N stream(s)`
2. Open chart → status should show **WS live** (not SSE fallback)
3. Close a trade → within ~10 min journal updates without manual Sync
