# axe-metaapi-streamer v2

Long-lived Node process that connects to MetaApi via the official streaming
SDK (`metaapi.cloud-sdk`) and pushes normalized chart events to the Cloudflare
ChartLiveRoom Durable Object via `/internal/publish`.

## What changed in v2

- **Dynamic subscriptions** — loads accounts + watchlist from Supabase on startup
- **Multi-symbol** — subscribes to ALL watchlist symbols per account on one connection
- **Orders listener** — pending orders (buy limit, sell stop, etc.) now stream to the client
- **Hot-add symbols** — new watchlist items detected within 60s, no restart needed
- **Backwards compatible** — set `STATIC_MODE=true` to use the old `SUBSCRIPTIONS` env

## Architecture

```
MetaApi SDK (socket.io) → Node Streamer → HTTP POST → CF DO → WebSocket → Browser
```

The streamer queries Supabase every 60s to discover:
1. Active MT5 cloud accounts (`user_broker_accounts`)
2. Watchlist symbols per user (`assistant_memory_entries`)
3. Broker symbol mapping (`metadata.symbol_map`)

Ticks fan out to ALL timeframe rooms for a symbol. Positions and orders
broadcast to all rooms for the affected symbol.

## Setup

```bash
cd node/metaapi-streamer
npm install
cp .env.example .env
# Fill in METAAPI_TOKEN, WORKER_URL, STREAMER_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

## Run locally

```bash
npm run dev
```

## Build & deploy

```bash
npm run build
npm start
```

### Railway

Push the `node/metaapi-streamer` folder. Set env vars in the dashboard.

### Docker

```bash
npm run build
docker build -t axe-streamer .
docker run --env-file .env axe-streamer
```

## Switching the Cloudflare Worker to push mode

After the streamer is running:

```bash
cd ../../cloudflare/chart-edge
npx wrangler secret put STREAMER_SECRET
# Edit wrangler.toml: WORKER_MODE = "push"
npx wrangler deploy
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `METAAPI_TOKEN` | ✅ | MetaApi API token |
| `WORKER_URL` | ✅ | CF Worker base URL |
| `STREAMER_SECRET` | ✅ | HMAC secret for `/internal/publish` |
| `SUPABASE_URL` | ✅* | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅* | Supabase service role key |
| `STATIC_MODE` | | Set `true` for legacy static subscriptions |
| `SUBSCRIPTIONS` | | Legacy comma-separated subscriptions |
| `LOG_LEVEL` | | `error` / `warn` / `info` / `debug` |

\* Required unless `STATIC_MODE=true`.
