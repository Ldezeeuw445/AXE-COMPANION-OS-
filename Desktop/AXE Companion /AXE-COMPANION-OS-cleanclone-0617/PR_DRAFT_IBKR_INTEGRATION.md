Title: Add optional IBKR and Alpaca live adapters (safe, opt-in)

Summary:
- Adds dynamic loader and adapter shims so `ibkr-live` and `alpaca-live` bundles
  can be dropped into `src/lib/broker/hub/adapters/AXE-COMPANION-OS-/` and
  loaded at runtime when `ENABLE_IBKR_LIVE` / `ENABLE_ALPACA_LIVE` are enabled.

Files changed / added (high level):
- `src/lib/broker/hub/adapters/.../adapterRegistry.ts` — dynamic loader
- `alpaca-live-ready/` and `ibkr-live-ready/` — adapter bundles & api shims
- `scripts/simulate-create-ibkr.mjs` — dry-run simulation script

Test plan (performed locally):
1. Placed `ibkr-live` bundle in `ibkr-live-ready/` (from user provided bundle).
2. Ran `scripts/simulate-create-ibkr.mjs` with fallback stub; simulation shows
   a successful hub.connect() and the metadata that would be written to
   `user_broker_accounts.metadata`.

Sample simulation output:
```
Hub connect result: { id: 'stub_ibkr_fallback_...', status: 'connected', input: {...} }
Would update `user_broker_accounts.metadata` with: { ibkr: { hubConnectionId: '...', hubStatus: 'connected' } }
```

Safety & rollout notes:
- Adapters are opt-in via env flags; defaults are disabled.
- `BROKER_HUB_ENCRYPTION_KEY` must be set before credential persistence.
- Keep `IBKR_ENABLE_LIVE_TRADING=false` during testing to prevent live orders.

Next steps before merge:
1. Run the real integration test by enabling `ts-node` loader in CI or
   precompiling TypeScript adapters to JS for runtime import.
2. Optionally add E2E test that runs `createIbkrAccountActionWithHub` against
   a staging Supabase instance and verifies metadata updates.
