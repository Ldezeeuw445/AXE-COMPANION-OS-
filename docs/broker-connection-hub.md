# Broker Connection Hub — Supabase integration

Backend wiring for [broker-connection-hub](https://github.com/Ldezeeuw445/broker-connection-hub) without frontend changes.

## Apply migration

Run in Supabase SQL Editor:

`supabase/migrations/20260615120000_broker_connection_hub.sql`

Creates:

- `broker_providers` — catalog (MT5 enabled, Alpaca/IBKR catalog-ready)
- `broker_symbol_mappings` — canonical ↔ broker symbols
- `broker_connection_secrets` — credential hints only (no raw secrets)
- Hub columns on `user_broker_accounts`: `hub_broker_id`, `trading_mode`, `hub_status`, `hub_permissions`

## Code layout

| Path | Role |
|------|------|
| `src/lib/broker/hub/contract.ts` | Hub TypeScript contracts |
| `src/lib/broker/hub/service.ts` | `BrokerConnectionHubService` |
| `src/lib/broker/hub/createHub.ts` | `createAxeBrokerConnectionHub()` factory |
| `src/lib/broker/hub/adapters/*` | Supabase + MT5 + Alpaca/IBKR stubs |
| `src/lib/broker/hub/sync.ts` | Sync hub fields after MT5 connect |

## Enabling Alpaca / IBKR later

1. Apply migration (if not already)
2. Implement real `BrokerApiAdapter` in `adapters/alpacaLive.ts` / `ibkrLive.ts`
3. Register in `adapters/registry.ts`
4. `update broker_providers set enabled = true where id in ('alpaca-style','ibkr-style');`
5. Add connect UI when ready — schema and hub service already support it

MT5 continues via existing Accounts wizard + MetaApi; hub sync runs automatically.
