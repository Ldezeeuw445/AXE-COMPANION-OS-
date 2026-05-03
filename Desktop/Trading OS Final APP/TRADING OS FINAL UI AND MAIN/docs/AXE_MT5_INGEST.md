# AXE · MT5 ingest (Phase 1)

## Edge Function
- **Name**: `axe-mt5-ingest`
- **Purpose**: receive MT5 fills/trades via HTTPS, validate account link token, upsert into `broker_trades`.
- **Security**: token is shown once at creation time; AXE stores **only** `SHA-256(token)` in `user_broker_accounts.link_token_hash`.
- **JWT**: this function is designed for MT5 EA calls (no Supabase user JWT). Ensure `verify_jwt = false` via `supabase/functions/axe-mt5-ingest/config.toml`.

## Required Supabase env (Edge secrets)
Set on the `axe-mt5-ingest` function:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ENGINE_SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY` / `SERVICE_ROLE_KEY`)

## Manual test (curl)
Replace:
- `SUPABASE_URL` with your project URL
- `TOKEN` with the link token shown in AXE Companion

```bash
curl -sS -X POST \
  "SUPABASE_URL/functions/v1/axe-mt5-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TOKEN",
    "account_meta": { "label": "Funded MT5", "mt5_login": "123456", "mt5_server": "Broker-Server" },
    "trades": [
      {
        "external_trade_id": "mt5_10001",
        "symbol": "XAUUSD",
        "side": "buy",
        "volume": 0.10,
        "open_time": "2026-04-30T08:00:00Z",
        "close_time": "2026-04-30T08:10:00Z",
        "open_price": 2334.12,
        "close_price": 2338.55,
        "pnl": 44.30,
        "fees": 0.00,
        "raw": { "comment": "test" }
      }
    ]
  }'
```

Expected response shape:

```json
{ "ok": true, "data": { "accepted": 1, "inserted": 0, "updated": 1, "rejected": 0, "account_id": "..." } }
```

## Tables
- `public.user_broker_accounts`
- `public.broker_trades`
- `public.trade_journal_labels`
- `public.user_workspace_preferences.active_account_id`

