# Chart edge — production deploy runbook

End-to-end steps to take the AXE Companion realtime chart from this commit to a
fully deployed setup on Vercel + Cloudflare. Follow top to bottom.

> Anything in `<angle brackets>` is a placeholder you fill in.

## 0. Generate the shared secret

Run **once**, locally:

```bash
openssl rand -base64 48
```

Save the value. The same string goes into Vercel **and** Cloudflare as
`CHART_SESSION_JWT_SECRET`. Do **not** commit it.

## 1. Cloudflare worker (`cloudflare/chart-edge`)

```bash
cd cloudflare/chart-edge
npm install
npx wrangler login            # one-time
npx wrangler secret put CHART_SESSION_JWT_SECRET   # paste the openssl value
npx wrangler secret put METAAPI_TOKEN              # same token Vercel uses
# Optional, only needed when wiring the Node streamer:
# npx wrangler secret put STREAMER_SECRET
```

Set non-secret vars in `wrangler.toml` (already filled with sane defaults):

- `METAAPI_CLIENT_API_URL` — region-specific, default London.
- `METAAPI_MARKET_DATA_URL` — region-specific, default London.
- `ALLOWED_ORIGINS` — comma-separated list of your Next domains, e.g.
  `https://app.axecompanion.com,https://staging.axecompanion.com`.
- `WORKER_MODE` — `poll` (default) or `push`. Set `push` only after the
  Node streamer is live (skips the Worker's own polling).

Deploy:

```bash
npm run deploy
```

Wrangler prints the worker URL, e.g. `https://axe-chart-edge.<account>.workers.dev`.

(Optional) Bind a custom hostname in the Cloudflare dashboard under
**Workers & Pages → axe-chart-edge → Triggers → Custom Domains**, e.g.
`chart.axecompanion.com`.

## 2. Vercel (Next app)

Add the following project env vars (Production + Preview):

```bash
vercel env add CHART_SESSION_JWT_SECRET   # same value as on Cloudflare
vercel env add NEXT_PUBLIC_CHART_WS_URL   # wss://chart.<your-domain>/ws/chart
```

Existing required env (already set in earlier steps):

- `METAAPI_TOKEN` (server-only)
- `NEXT_PUBLIC_SUPABASE_URL`
- Supabase keys

Redeploy:

```bash
vercel --prod
```

## 3. Smoke test

```bash
# Worker health
curl https://chart.<your-domain>/health           # → ok

# Session token (logged-in browser only)
# In the chart page, open DevTools → Network → POST /api/chart/session
# Expect { token, wsUrl, expiresIn }

# WebSocket
# Same DevTools → WS frame: expect "ready" event, then periodic "tick",
# "candle_update", "positions_update", "live_status".
```

In the chart Data details panel, the **Live stream** field should read
`Live stream · WS`. If you see `Delayed polling · SSE` the WS endpoint is
unreachable — check Cloudflare logs and `ALLOWED_ORIGINS`.

## 4. (Optional) Node MetaApi streamer

When you want true push-based streaming instead of edge polling:

```bash
cd node/metaapi-streamer
npm install
cp .env.example .env
# Fill MetaApi token, streamer secret, worker URL, default rooms
npm run dev
```

Deploy that container/process to Railway / Fly / Render / a small VPS.

Then on Cloudflare:

```bash
npx wrangler secret put STREAMER_SECRET
# Update wrangler.toml: WORKER_MODE = "push"
npm run deploy
```

The Worker now disables its own REST loop and only fans out events from
`/internal/publish`. Frontend behaviour does not change.

See `node/metaapi-streamer/README.md` for the full streamer details.

## 5. Audit snapshots (optional)

Apply the migration:

```sql
-- supabase/migrations/20260504130000_chart_live_snapshots.sql
```

The Next route `/api/chart/snapshot` accepts authenticated writes; the streamer
or the Worker can post latest tick/candle/positions snapshots there for audit.
This step is optional — the chart works without it.

## 6. Rollback

If anything goes wrong:

- Remove `NEXT_PUBLIC_CHART_WS_URL` on Vercel and redeploy. The chart falls
  back to SSE automatically.
- Revert `WORKER_MODE` to `poll` to disable streamer dependency.

## 7. Production hardening checklist

- [ ] `ALLOWED_ORIGINS` set to exact Next hostnames, not `*`.
- [ ] `CHART_SESSION_JWT_SECRET` rotated quarterly.
- [ ] Worker logs piped to Logpush / log drains.
- [ ] Supabase RLS verified for `user_broker_accounts.metadata` writes (the
      loader already only runs as the user).
- [ ] Streamer process monitored (PM2 / Fly health checks).
