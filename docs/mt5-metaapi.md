# MetaApi cloud MT5 (AXE Companion)

Premium in-app path: users enter MT5 login, server, and **investor (read-only) password** in the Next.js app. Server actions call MetaApi; **passwords and MetaApi tokens are never stored in Supabase or browser storage**.

## Environment variables

These must be available to the **Next.js server** (e.g. Vercel project → Environment Variables).  
Supabase **Dashboard → Project Settings → Secrets** is only visible to Edge Functions / vault workflows; the MetaApi server actions do **not** read Supabase secrets automatically. Copy the same token value to Vercel (or your host) under one of the names below.

| Variable | Required | Description |
|----------|----------|-------------|
| `METAAPI_TOKEN` or `AXE_METAAPI_TOKEN` or `AXE_MT5_METAAPI_TOKEN` | Yes | MetaApi token (first non-empty wins). Server only — never `NEXT_PUBLIC_*`. |
| `METAAPI_DEFAULT_REGION` | No | Default `london`. |
| `METAAPI_PROVISIONING_URL` | No | Override provisioning base URL. |
| `METAAPI_CLIENT_API_URL` | No | Override MetaTrader client REST host for your account region. |

## Default MetaApi endpoints (London)

- **Provisioning:** `https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai`
- **Client API (London):** `https://mt-client-api-vzsrmwxzqcwfarnn.london.agiliumtrade.ai`
- **MetaStats (London):** `https://metastats-api-v1.london.agiliumtrade.ai` (not wired in v1)

## Database (copy-paste)

1. Open Supabase → **SQL Editor** → New query.
2. Paste the **entire** contents of **`supabase/copy-paste-mt5-cloud-migration.sql`** (same SQL as `supabase/migrations/20260430120000_mt5_cloud_metaapi_columns.sql`) and click **Run**.

Adds to `user_broker_accounts`: `connection_method`, `external_connection_id`, `provider_status`, `last_sync_at`, `masked_login`, `metadata`. Adds to `broker_trades`: `external_trade_id`, `raw` + partial unique index for upserts.

## Deployment

1. Set env vars on Vercel/host (never `NEXT_PUBLIC_*` for MetaApi token).
2. Run SQL migration on Supabase.
3. Redeploy Next.js.
4. In **Accounts**, use **Connect MT5 (MetaApi cloud)** → **Test** → **Sync**.

## Testing (manual)

1. Use a demo MT5 account with investor password.
2. Confirm provisioning completes (row appears with MetaApi id).
3. **Test** updates `provider_status` and account summary in metadata.
4. **Sync** pulls last 90 days of history deals; closed positions become `broker_trades` rows (`external_trade_id` = `metaapi:<positionId>`).
5. Open **History**, **Journal** (`?trade=&account=`), **Chat** with account active.

## Not implemented (future)

- Realtime Socket.IO terminal stream
- MetaStats metrics
- Order execution / trading from AXE

## Verification

From repo directory: `npm run build`
