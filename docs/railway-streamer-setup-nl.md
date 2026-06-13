# MetaApi Streamer — Railway (3 stappen, geen Root Directory)

Deploy de streamer als **apart Railway-project** (niet dezelfde service als Vercel/Next).

## Stap 1 — Nieuw Railway-project

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Kies `AXE-COMPANION-OS-`
3. Railway maakt één service aan

## Stap 2 — Config file (enige technische instelling)

1. Klik op de **service** (het blok in je project)
2. **Settings** → scroll naar **Config-as-code** (of **Railway Config File**)
3. Zet **Config file path** op:
   ```
   /node/metaapi-streamer/railway.json
   ```
4. Sla op en **Redeploy**

> Je hoeft **geen Root Directory** te zetten. `Dockerfile.streamer` in de repo-root bouwt de streamer uit `node/metaapi-streamer/`.

## Stap 3 — Environment variables

Service → **Variables**:

| Variable | Waarde |
|----------|--------|
| `METAAPI_TOKEN` | Zelfde als Vercel |
| `WORKER_URL` | Cloudflare chart-edge URL (zonder trailing slash) |
| `STREAMER_SECRET` | Random string — ook op Cloudflare zetten |
| `SUPABASE_URL` | Zelfde als `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Zelfde als Vercel |

## Cloudflare (eenmalig)

```bash
cd cloudflare/chart-edge
npx wrangler secret put STREAMER_SECRET   # zelfde waarde als Railway
npx wrangler deploy
```

`WORKER_MODE` staat al op `push` in `wrangler.toml`.

## Controleren

Railway **Logs**:

```
Dynamic mode — loading account configs from Supabase
Found 1 account(s)
Health server listening on :8080/health
```

Public URL → `https://<service>.up.railway.app/health` → `{ "ok": true, "streams": 1 }`

Chart in de app → **WS live** (niet SSE fallback).

## Optioneel — auto-deploy via GitHub

Voeg in GitHub repo **Settings → Secrets → Actions** toe:

- `RAILWAY_TOKEN` — Railway → Account Settings → Tokens

Voeg in GitHub **Settings → Variables → Actions** toe:

- `RAILWAY_STREAMER_SERVICE_ID` — Railway service ID (Settings → General)

Dan deployt `.github/workflows/deploy-metaapi-streamer.yml` automatisch bij pushes naar `node/metaapi-streamer/`.
